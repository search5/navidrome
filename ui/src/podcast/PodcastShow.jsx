import React, { useEffect, useState } from 'react'
import {
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  makeStyles,
  Link,
} from '@material-ui/core'
import { useTranslate, useShowController, Title } from 'react-admin'
import MicIcon from '@material-ui/icons/Mic'
import StatusBadge from './StatusBadge'
import EpisodeActions from './EpisodeActions'
import subsonic from '../subsonic'

const useStyles = makeStyles((theme) => ({
  card: { marginTop: theme.spacing(2) },
  header: { display: 'flex', gap: theme.spacing(2), marginBottom: theme.spacing(3) },
  avatar: {
    width: 80,
    height: 80,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.palette.grey[300],
    borderRadius: 4,
    flexShrink: 0,
  },
  meta: { flex: 1 },
  description: { marginTop: theme.spacing(1), color: theme.palette.text.secondary },
  tableWrapper: { marginTop: theme.spacing(2), overflowX: 'auto' },
}))

const formatDuration = (seconds) => {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

const formatBytes = (bytes) => {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const PodcastShow = (props) => {
  const classes = useStyles()
  const translate = useTranslate()
  const { record } = useShowController(props)
  const [episodes, setEpisodes] = useState([])

  const loadEpisodes = () => {
    if (!record?.id) return
    subsonic
      .getPodcasts(record.id, true)
      .then((res) => {
        const channels = res?.json?.['subsonic-response']?.podcasts?.channel || []
        const ch = channels.find((c) => c.id === record.id)
        setEpisodes(ch?.episode || [])
      })
      .catch(() => {})
  }

  useEffect(loadEpisodes, [record?.id])

  // Poll while any episode is downloading
  useEffect(() => {
    const hasDownloading = episodes.some((ep) => ep.status === 'downloading')
    if (!hasDownloading) return
    const timer = setInterval(loadEpisodes, 3000)
    return () => clearInterval(timer)
  }, [episodes])

  if (!record) return null

  return (
    <Card className={classes.card}>
      <Title subTitle={record.title} />
      <CardContent>
        <div className={classes.header}>
          <div className={classes.avatar}>
            {record.imageUrl ? (
              <img
                src={record.imageUrl}
                alt={record.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }}
              />
            ) : (
              <MicIcon style={{ fontSize: 40, color: '#888' }} />
            )}
          </div>
          <div className={classes.meta}>
            <Typography variant="h5">{record.title}</Typography>
            <Link href={record.url} target="_blank" rel="noopener noreferrer" variant="body2">
              {record.url}
            </Link>
            {record.description && (
              <Typography variant="body2" className={classes.description}>
                {record.description}
              </Typography>
            )}
            {record.status === 'error' && (
              <StatusBadge status="error" errorMessage={record.errorMessage} />
            )}
          </div>
        </div>

        <div className={classes.tableWrapper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{translate('resources.podcast.fields.title')}</TableCell>
                <TableCell>{translate('resources.podcast.fields.publishDate')}</TableCell>
                <TableCell>{translate('resources.podcast.fields.duration')}</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>{translate('resources.podcast.fields.status')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {episodes.map((ep) => (
                <TableRow key={ep.id}>
                  <TableCell>{ep.title}</TableCell>
                  <TableCell>
                    {ep.publishDate ? new Date(ep.publishDate).toLocaleDateString() : ''}
                  </TableCell>
                  <TableCell>{formatDuration(ep.duration)}</TableCell>
                  <TableCell>{formatBytes(ep.size)}</TableCell>
                  <TableCell>
                    <StatusBadge status={ep.status} errorMessage={ep.errorMessage} />
                  </TableCell>
                  <TableCell>
                    <EpisodeActions episode={ep} channelTitle={record.title} onRefresh={loadEpisodes} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

export default PodcastShow
