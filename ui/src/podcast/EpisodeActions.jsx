import React from 'react'
import { IconButton, CircularProgress, LinearProgress, Typography, Box } from '@material-ui/core'
import PlayArrowIcon from '@material-ui/icons/PlayArrow'
import GetAppIcon from '@material-ui/icons/GetApp'
import DeleteIcon from '@material-ui/icons/Delete'
import { useDispatch } from 'react-redux'
import subsonic from '../subsonic'
import { setTrack } from '../actions'

const formatBytes = (bytes) => {
  if (!bytes) return '0 B'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const songFromEpisode = (episode, channelTitle) => ({
  id: episode.streamId,
  title: episode.title,
  album: channelTitle || episode.channelId,
  artist: '',
  duration: episode.duration,
  suffix: episode.suffix,
  isPodcast: true,
})

const EpisodeActions = ({ episode, channelTitle, onRefresh }) => {
  const dispatch = useDispatch()

  const handlePlay = () => dispatch(setTrack(songFromEpisode(episode, channelTitle)))

  const handleDownload = async () => {
    await subsonic.downloadPodcastEpisode(episode.id)
    onRefresh?.()
  }

  const handleDelete = async () => {
    await subsonic.deletePodcastEpisode(episode.id)
    onRefresh?.()
  }

  if (episode.status === 'downloading') {
    const total = episode.size || 0
    const downloaded = episode.downloadedBytes || 0
    const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0
    return (
      <Box display="flex" flexDirection="column" style={{ minWidth: 140, gap: 4 }}>
        <LinearProgress
          variant={total > 0 ? 'determinate' : 'indeterminate'}
          value={percent}
        />
        <Typography variant="caption" color="textSecondary" style={{ whiteSpace: 'nowrap' }}>
          {total > 0
            ? `${formatBytes(downloaded)} / ${formatBytes(total)} (${percent}%)`
            : `${formatBytes(downloaded)} 다운로드 중...`}
        </Typography>
      </Box>
    )
  }

  if (episode.status === 'completed') {
    return (
      <>
        <IconButton aria-label="play" size="small" onClick={handlePlay}>
          <PlayArrowIcon fontSize="small" />
        </IconButton>
        <IconButton aria-label="delete" size="small" onClick={handleDelete}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </>
    )
  }

  if (episode.status === 'new' || episode.status === 'error') {
    return (
      <>
        <IconButton aria-label="download" size="small" onClick={handleDownload}>
          <GetAppIcon fontSize="small" />
        </IconButton>
        <IconButton aria-label="delete" size="small" onClick={handleDelete}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </>
    )
  }

  return null
}

export default EpisodeActions
