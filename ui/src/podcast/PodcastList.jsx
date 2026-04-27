import React from 'react'
import { Avatar, makeStyles, useMediaQuery } from '@material-ui/core'
import MicIcon from '@material-ui/icons/Mic'
import RefreshIcon from '@material-ui/icons/Refresh'
import {
  Button,
  CreateButton,
  Datagrid,
  DateField,
  Filter,
  sanitizeListRestProps,
  SearchInput,
  SimpleList,
  TextField,
  TopToolbar,
  useNotify,
  useRefresh,
  useTranslate,
} from 'react-admin'
import { List } from '../common'
import subsonic from '../subsonic'
import StatusBadge from './StatusBadge'

const useStyles = makeStyles({
  row: {
    '&:hover': { '& $contextMenu': { visibility: 'visible' } },
  },
  contextMenu: { visibility: 'hidden' },
})

const PodcastFilter = (props) => (
  <Filter {...props} variant="outlined">
    <SearchInput id="search" source="title" alwaysOn />
  </Filter>
)

const CoverArtField = ({ record }) => {
  if (!record) return null
  if (record.imageUrl) {
    return (
      <Avatar
        src={record.imageUrl}
        variant="rounded"
        style={{ width: 40, height: 40 }}
        alt={record.title}
      />
    )
  }
  return (
    <Avatar variant="rounded" style={{ width: 40, height: 40 }}>
      <MicIcon />
    </Avatar>
  )
}
CoverArtField.defaultProps = { label: '' }

const StatusField = ({ record }) => {
  if (!record || record.status !== 'error') return null
  return <StatusBadge status="error" errorMessage={record.errorMessage} />
}
StatusField.defaultProps = { label: '' }

const RefreshButton = () => {
  const notify = useNotify()
  const refresh = useRefresh()
  const translate = useTranslate()

  const handleClick = async () => {
    await subsonic.refreshPodcasts()
    notify('resources.podcast.notifications.refreshStarted')
    refresh()
  }

  return (
    <Button onClick={handleClick} label="resources.podcast.actions.refresh">
      <RefreshIcon />
    </Button>
  )
}

const PodcastListActions = ({ className, filters, resource, showFilter, displayedFilters, filterValues, isAdmin, ...rest }) => {
  return (
    <TopToolbar className={className} {...sanitizeListRestProps(rest)}>
      {isAdmin && <RefreshButton />}
      {isAdmin && <CreateButton basePath="/podcast" />}
      {filters && React.cloneElement(filters, { resource, showFilter, displayedFilters, filterValues, context: 'button' })}
    </TopToolbar>
  )
}

const PodcastList = ({ permissions, ...props }) => {
  const classes = useStyles()
  const isXsmall = useMediaQuery((theme) => theme.breakpoints.down('xs'))
  const isAdmin = permissions === 'admin'

  return (
    <List
      {...props}
      exporter={false}
      sort={{ field: 'title', order: 'ASC' }}
      bulkActionButtons={isAdmin ? undefined : false}
      hasCreate={isAdmin}
      actions={<PodcastListActions isAdmin={isAdmin} />}
      filters={<PodcastFilter />}
    >
      {isXsmall ? (
        <SimpleList
          leftAvatar={(r) => <CoverArtField record={r} />}
          primaryText={(r) => r.title}
          secondaryText={(r) => r.url}
        />
      ) : (
        <Datagrid rowClick="show" classes={{ row: classes.row }}>
          <CoverArtField source="id" sortable={false} />
          <TextField source="title" />
          <TextField source="url" />
          <StatusField source="status" sortable={false} />
          <DateField source="updatedAt" showTime />
        </Datagrid>
      )}
    </List>
  )
}

export default PodcastList
