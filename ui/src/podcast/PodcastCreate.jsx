import React, { useState } from 'react'
import { useTranslate, useNotify, useRedirect, useRefresh, Title } from 'react-admin'
import { Card, CardContent, TextField, Button, makeStyles } from '@material-ui/core'
import subsonic from '../subsonic'

const useStyles = makeStyles((theme) => ({
  root: { marginTop: theme.spacing(2) },
  form: { display: 'flex', flexDirection: 'column', gap: theme.spacing(2), maxWidth: 480 },
  submit: { alignSelf: 'flex-start' },
}))

const PodcastCreate = () => {
  const translate = useTranslate()
  const notify = useNotify()
  const redirect = useRedirect()
  const refresh = useRefresh()
  const classes = useStyles()
  const [feedUrl, setFeedUrl] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!feedUrl) return
    setLoading(true)
    try {
      await subsonic.createPodcastChannel(feedUrl)
      notify('resources.podcast.notifications.channelAdded')
      redirect('/podcast')
      refresh()
    } catch {
      notify('ra.notification.http_error', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const title = translate('ra.page.create', {
    name: translate('resources.podcast.name', { smart_count: 1 }),
  })

  return (
    <Card className={classes.root}>
      <Title subTitle={title} />
      <CardContent>
        <form role="form" onSubmit={handleSubmit} className={classes.form}>
          <TextField
            label={translate('resources.podcast.fields.url')}
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            type="url"
            required
            fullWidth
            variant="outlined"
          />
          <Button
            className={classes.submit}
            type="submit"
            variant="contained"
            color="primary"
            disabled={loading || !feedUrl}
          >
            {translate('resources.podcast.actions.addChannel')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export default PodcastCreate
