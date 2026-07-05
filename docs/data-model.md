# Dataverse data model — `lip_*` tables (Phase 2, audit persistence)

The MVP keeps configurations and run history **in memory**. To persist them
(filterable, linkable, auditable), create these tables in the trial and add them
as data sources. Column types map from `src/domain/*` (source of truth).

Prefix: `lip_`. Each table's primary name column is noted.

## `lip_jobconfiguration`  (name: `lip_name`)
| Column | Type | From |
| --- | --- | --- |
| `lip_name` | Text | JobConfiguration.name |
| `lip_description` | Multiline | .description |
| `lip_targetentity` | Text | .targetEntity |
| `lip_entitysetname` | Text | .entitySetName |
| `lip_operation` | Choice | .operation |
| `lip_version` | Whole Number | .version |
| `lip_isactive` | Yes/No | .isActive |
| `lip_configjson` | Multiline (JSON) | full JobConfiguration |
| `lip_schemaversion` | Whole Number | .schemaVersion |

## `lip_importjob`  (name: `lip_name`)
| Column | Type | From |
| --- | --- | --- |
| `lip_name` | Text | e.g. file + timestamp |
| `lip_configuration` | Lookup → lip_jobconfiguration | .configId |
| `lip_configsnapshotjson` | Multiline (JSON) | .configSnapshot |
| `lip_mode` | Choice (strict/partial) | .mode |
| `lip_status` | Choice | .status |
| `lip_startedon` / `lip_finishedon` | DateTime | .startedOn/.finishedOn |
| `lip_rowcount` / `lip_readycount` / `lip_errorcount` / `lip_conflictcount` / `lip_committedcount` | Whole Number | counts |
| `lip_filename` | Text | .fileName |

## `lip_importrow`  (name: `lip_name`)
| Column | Type | From |
| --- | --- | --- |
| `lip_name` | Text | e.g. `Row {rowNumber}` |
| `lip_importjob` | Lookup → lip_importjob | job |
| `lip_rownumber` | Whole Number | .rowNumber |
| `lip_rawjson` | Multiline (JSON) | .raw |
| `lip_targetrecordid` | Text | .targetRecordId |
| `lip_status` | Choice | .status |
| `lip_messages` | Multiline | .messages |
| `lip_lookupsjson` | Multiline (JSON) | .lookups |
| `lip_writeresultjson` | Multiline (JSON) | .writeResult |

## `lip_resolutiondecision`  (name: `lip_name`)
| Column | Type | From |
| --- | --- | --- |
| `lip_name` | Text | source value |
| `lip_importjob` | Lookup → lip_importjob | job |
| `lip_rownumber` | Whole Number | .rowNumber |
| `lip_lookupattribute` | Text | .lookupAttribute |
| `lip_sourcevalue` | Text | .sourceValue |
| `lip_candidatesjson` | Multiline (JSON) | .candidates |
| `lip_chosenid` | Text | .chosenId |
| `lip_chosenentity` | Text | .chosenEntity |
| `lip_appliedfilter` | Multiline | .appliedFilter |
| `lip_decidedby` | Lookup → systemuser / Text | .decidedBy |
| `lip_decidedon` | DateTime | .decidedOn |
| `lip_appliedtoall` | Yes/No | .appliedToAll |

> Implementation note: a future `ImportJobRepository` (behind the same client
> abstraction) will read/write these. The config JSON is stored whole so the
> app can round-trip without exhaustive column promotion; key fields are
> promoted for filtering/search.
