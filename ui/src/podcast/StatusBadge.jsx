import React from 'react'
import { Chip, CircularProgress, Tooltip, makeStyles } from '@material-ui/core'
import { useTranslate } from 'react-admin'

const useStyles = makeStyles((theme) => ({
  completed: { backgroundColor: theme.palette.success?.main || '#4caf50', color: '#fff' },
  downloading: { backgroundColor: theme.palette.info?.main || '#2196f3', color: '#fff' },
  error: { backgroundColor: theme.palette.error.main, color: '#fff', cursor: 'default' },
  new: {},
  skipped: { backgroundColor: theme.palette.warning?.main || '#ff9800', color: '#fff' },
}))

const StatusBadge = ({ status, errorMessage }) => {
  const translate = useTranslate()
  const classes = useStyles()

  if (!status || status === 'deleted') return null

  const label = translate(`resources.podcast.status.${status}`, { _: status })

  if (status === 'downloading') {
    return (
      <Chip
        className={classes.downloading}
        label={label}
        size="small"
        icon={<CircularProgress size={12} color="inherit" />}
      />
    )
  }

  if (status === 'error' && errorMessage) {
    return (
      <Tooltip title={errorMessage}>
        <Chip className={classes.error} label={label} size="small" />
      </Tooltip>
    )
  }

  return (
    <Chip
      className={classes[status] || classes.new}
      label={label}
      size="small"
    />
  )
}

export default StatusBadge
