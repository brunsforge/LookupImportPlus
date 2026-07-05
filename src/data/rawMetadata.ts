/**
 * Re-exports of the SDK's raw Dataverse metadata shapes.
 *
 * We isolate the dependency on `@microsoft/power-apps` metadata types here so the
 * client interface can reference them without every caller importing SDK paths.
 * `MetadataService` normalizes these into the app's own `domain/metadata` types;
 * nothing outside `data/` should consume the raw shapes directly.
 */
export type {
  EntityMetadata as RawEntityMetadata,
  GetEntityMetadataOptions,
} from "@microsoft/power-apps/data/metadata/dataverse";
