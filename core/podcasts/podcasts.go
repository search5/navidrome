package podcasts

import (
	"context"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/navidrome/navidrome/conf"
	"github.com/navidrome/navidrome/core/ffmpeg"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/id"
)

const podcastLibraryName = "Podcasts"

type Podcasts interface {
	AddChannel(ctx context.Context, rssURL string) error
	RefreshChannels(ctx context.Context) error
	DeleteChannel(ctx context.Context, id string) error
	DeleteEpisode(ctx context.Context, id string) error
	DownloadEpisode(ctx context.Context, id string) error
}

type podcastService struct {
	ds model.DataStore
	ff ffmpeg.FFmpeg
}

func NewPodcastService(ds model.DataStore, ff ffmpeg.FFmpeg) Podcasts {
	return &podcastService{ds: ds, ff: ff}
}

// podcastLibraryID returns the ID of the podcast virtual library,
// creating it if it doesn't exist. The library root is DataFolder so that
// MediaFile paths stored as "podcasts/{ch}/{ep}.mp3" resolve correctly via AbsolutePath().
func (s *podcastService) podcastLibraryID(ctx context.Context) (int, error) {
	libs, err := s.ds.Library(ctx).GetAll()
	if err != nil {
		return 0, err
	}
	for _, lib := range libs {
		if lib.Name == podcastLibraryName {
			return lib.ID, nil
		}
	}
	lib := &model.Library{
		Name: podcastLibraryName,
		Path: conf.Server.DataFolder,
	}
	if err := s.ds.Library(ctx).Put(lib); err != nil {
		return 0, err
	}
	return lib.ID, nil
}

func (s *podcastService) AddChannel(ctx context.Context, rssURL string) error {
	feed, err := fetchAndParse(rssURL)
	if err != nil {
		return fmt.Errorf("adding podcast channel: %w", err)
	}

	ch := &model.PodcastChannel{
		URL:         rssURL,
		Title:       feed.Title,
		Description: feed.Description,
		ImageURL:    feed.ImageURL,
		Status:      model.PodcastStatusNew,
	}
	if err := s.ds.PodcastChannel(ctx).Create(ch); err != nil {
		return err
	}

	for i := range feed.Episodes {
		ep := feed.Episodes[i]
		ep.ChannelID = ch.ID
		ep.Status = model.PodcastStatusNew
		if err := s.ds.PodcastEpisode(ctx).Create(&ep); err != nil {
			return err
		}
	}

	ch.Status = model.PodcastStatusCompleted
	return s.ds.PodcastChannel(ctx).UpdateChannel(ch)
}

func (s *podcastService) RefreshChannels(ctx context.Context) error {
	channels, err := s.ds.PodcastChannel(ctx).GetAll(false)
	if err != nil {
		return err
	}

	for _, ch := range channels {
		if err := s.refreshChannel(ctx, ch); err != nil {
			log.Warn(ctx, "Failed to refresh podcast channel", "channel", ch.Title, err)
		}
	}
	return nil
}

func (s *podcastService) refreshChannel(ctx context.Context, ch model.PodcastChannel) error {
	feed, err := fetchAndParse(ch.URL)
	if err != nil {
		return err
	}

	epRepo := s.ds.PodcastEpisode(ctx)
	for i := range feed.Episodes {
		ep := feed.Episodes[i]
		_, err := epRepo.GetByGUID(ch.ID, ep.GUID)
		if err == nil {
			continue // already exists
		}
		ep.ChannelID = ch.ID
		ep.Status = model.PodcastStatusNew
		if err := epRepo.Create(&ep); err != nil {
			return err
		}
	}
	return nil
}

func (s *podcastService) DownloadEpisode(ctx context.Context, id string) error {
	ep, err := s.ds.PodcastEpisode(ctx).Get(id)
	if err != nil {
		return err
	}

	ep.Status = model.PodcastStatusDownloading
	ep.UpdatedAt = time.Now()
	if err := s.ds.PodcastEpisode(ctx).Update(ep); err != nil {
		return err
	}

	go s.doDownload(context.Background(), ep)
	return nil
}

func (s *podcastService) doDownload(ctx context.Context, ep *model.PodcastEpisode) {
	suffix := ep.Suffix
	if suffix == "" {
		suffix = "mp3"
	}
	dir := filepath.Join(conf.Server.DataFolder, "podcasts", ep.ChannelID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		s.setEpisodeError(ctx, ep, err)
		return
	}

	dest := filepath.Join(dir, ep.ID+"."+suffix)
	f, err := os.Create(dest)
	if err != nil {
		s.setEpisodeError(ctx, ep, err)
		return
	}
	defer f.Close()

	resp, err := http.Get(ep.EnclosureURL) //nolint:gosec
	if err != nil {
		s.setEpisodeError(ctx, ep, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		err := fmt.Errorf("HTTP %d fetching %s", resp.StatusCode, ep.EnclosureURL)
		s.setEpisodeError(ctx, ep, err)
		return
	}

	size, err := io.Copy(&progressWriter{ep: ep, ds: s.ds, ctx: ctx, w: f}, resp.Body)
	if err != nil {
		s.setEpisodeError(ctx, ep, err)
		return
	}

	// Register as a MediaFile so /rest/stream works with the standard media file path.
	// Use a podcast virtual library whose root is DataFolder; store relative path.
	libID, libErr := s.podcastLibraryID(ctx)
	if libErr != nil {
		log.Warn(ctx, "Failed to get podcast library, streaming may not work", "episode", ep.ID, libErr)
	} else {
		relPath := strings.TrimPrefix(dest, conf.Server.DataFolder+string(filepath.Separator))
		now := time.Now()
		mf := &model.MediaFile{
			ID:        id.NewRandom(),
			LibraryID: libID,
			Path:      relPath,
			Title:     ep.Title,
			Duration:  float32(ep.Duration),
			Size:      size,
			BitRate:   ep.BitRate,
			Suffix:    suffix,
			CreatedAt: now,
			UpdatedAt: now,
		}
		if putErr := s.ds.MediaFile(ctx).Put(mf); putErr != nil {
			log.Warn(ctx, "Failed to register podcast episode as MediaFile", "episode", ep.ID, putErr)
		} else {
			ep.StreamID = mf.ID
		}
	}

	// Probe actual duration and bitrate from the downloaded file
	if s.ff != nil && s.ff.IsProbeAvailable() {
		if probe, probeErr := s.ff.ProbeAudioStream(ctx, dest); probeErr == nil {
			if probe.Duration > 0 {
				ep.Duration = int(math.Round(probe.Duration))
			}
			if probe.BitRate > 0 {
				ep.BitRate = probe.BitRate
			}
		} else {
			log.Warn(ctx, "Failed to probe podcast episode duration", "episode", ep.ID, probeErr)
		}
	}

	ep.Path = dest
	ep.Size = size
	ep.DownloadedBytes = size
	ep.Status = model.PodcastStatusCompleted
	ep.ErrorMessage = ""
	ep.UpdatedAt = time.Now()
	if err := s.ds.PodcastEpisode(ctx).Update(ep); err != nil {
		log.Error(ctx, "Failed to update episode after download", "episode", ep.ID, err)
	}
}

func (s *podcastService) setEpisodeError(ctx context.Context, ep *model.PodcastEpisode, err error) {
	ep.Status = model.PodcastStatusError
	ep.ErrorMessage = err.Error()
	ep.UpdatedAt = time.Now()
	if updateErr := s.ds.PodcastEpisode(ctx).Update(ep); updateErr != nil {
		log.Error(ctx, "Failed to set episode error status", "episode", ep.ID, updateErr)
	}
}

func (s *podcastService) DeleteEpisode(ctx context.Context, id string) error {
	ep, err := s.ds.PodcastEpisode(ctx).Get(id)
	if err != nil {
		return err
	}
	if ep.Path != "" {
		_ = os.Remove(ep.Path)
		ep.Path = ""
	}
	// Remove the registered MediaFile so it can be re-registered on next download
	if ep.StreamID != "" {
		_ = s.ds.MediaFile(ctx).Delete(ep.StreamID)
		ep.StreamID = ""
	}
	ep.Status = model.PodcastStatusNew
	ep.ErrorMessage = ""
	ep.Size = 0
	ep.DownloadedBytes = 0
	ep.Duration = 0
	ep.BitRate = 0
	ep.UpdatedAt = time.Now()
	return s.ds.PodcastEpisode(ctx).Update(ep)
}

func (s *podcastService) DeleteChannel(ctx context.Context, id string) error {
	episodes, err := s.ds.PodcastEpisode(ctx).GetByChannel(id)
	if err != nil {
		return err
	}
	for _, ep := range episodes {
		if ep.Path != "" {
			_ = os.Remove(ep.Path)
		}
	}
	return s.ds.PodcastChannel(ctx).Delete(id)
}

// progressWriter wraps an io.Writer and periodically saves download progress to DB.
type progressWriter struct {
	ep      *model.PodcastEpisode
	ds      model.DataStore
	ctx     context.Context
	w       io.Writer
	written int64
	lastDB  int64
}

const progressUpdateInterval = 512 * 1024 // update DB every 512 KB

func (pw *progressWriter) Write(p []byte) (int, error) {
	n, err := pw.w.Write(p)
	pw.written += int64(n)
	if pw.written-pw.lastDB >= progressUpdateInterval {
		pw.ep.DownloadedBytes = pw.written
		pw.ep.UpdatedAt = time.Now()
		_ = pw.ds.PodcastEpisode(pw.ctx).Update(pw.ep)
		pw.lastDB = pw.written
	}
	return n, err
}

func fetchAndParse(rssURL string) (*rssFeed, error) {
	resp, err := http.Get(rssURL) //nolint:gosec
	if err != nil {
		return nil, fmt.Errorf("fetching RSS feed: %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading RSS feed: %w", err)
	}

	return ParseRSSFeed(data)
}
