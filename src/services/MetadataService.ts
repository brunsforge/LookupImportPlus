/**
 * MetadataService — turns raw Dataverse metadata into the app's normalized
 * `domain/metadata` shapes and caches them.
 *
 * Lookup targets and navigation properties are derived from
 * `ManyToOneRelationships`, never guessed from attribute/target name pairs. This
 * is what makes polymorphic lookups (customer/owner/regarding) work correctly:
 * each allowed target is a distinct M:1 relationship carrying its own
 * `ReferencingEntityNavigationPropertyName` for `@odata.bind`.
 */

import type {
  AttributeKind,
  AttributeMetadata,
  EntityMetadata,
  EntitySummary,
  LookupTarget,
} from "@/domain/metadata";
import type { DataverseClient } from "@/data/DataverseClient";
import type { RawEntityMetadata, GetEntityMetadataOptions } from "@/data/rawMetadata";

/**
 * Entity-level metadata fields we need. The SDK only returns the selects listed
 * here — omitting them yields attributes but NO EntitySetName/PrimaryIdAttribute,
 * which then breaks every read/write (empty tableName). Learned the hard way.
 */
const ENTITY_META_FIELDS: NonNullable<GetEntityMetadataOptions["metadata"]> = [
  "LogicalName",
  "EntitySetName",
  "PrimaryIdAttribute",
  "PrimaryNameAttribute",
  "DisplayName",
  "DisplayCollectionName",
  "IsActivity",
];

/** One M:1 relationship as we consume it (subset of the raw shape). */
interface RawManyToOne {
  ReferencingAttribute: string;
  ReferencedEntity: string;
  ReferencingEntityNavigationPropertyName: string;
}

/** Map the SDK's `AttributeTypeName.Value` (e.g. "LookupType") to our kind. */
export function mapAttributeKind(typeName: string | undefined): AttributeKind {
  switch (typeName) {
    case "StringType":
      return "String";
    case "MemoType":
      return "Memo";
    case "IntegerType":
      return "Integer";
    case "BigIntType":
      return "BigInt";
    case "DecimalType":
      return "Decimal";
    case "DoubleType":
      return "Double";
    case "MoneyType":
      return "Money";
    case "BooleanType":
      return "Boolean";
    case "DateTimeType":
      return "DateTime";
    case "PicklistType":
      return "Choice";
    case "MultiSelectPicklistType":
      return "MultiChoice";
    case "LookupType":
    case "CustomerType":
    case "OwnerType":
    case "PartyListType":
      return "Lookup";
    case "UniqueidentifierType":
      return "UniqueIdentifier";
    case "StateType":
      return "State";
    case "StatusType":
      return "Status";
    default:
      return "Unknown";
  }
}

function localizedLabel(label: { UserLocalizedLabel?: { Label?: string } } | undefined): string {
  return label?.UserLocalizedLabel?.Label ?? "";
}

/**
 * Pure normalization of a raw entity metadata payload into our domain shape.
 * Lookup targets are filled with `logicalName` + `navigationProperty` only;
 * their entity-set/primary attributes are enriched later (they live on the
 * target entity's own metadata). Exported for unit testing.
 */
export function normalizeEntityMetadata(raw: RawEntityMetadata): EntityMetadata {
  const manyToOne = ((raw.ManyToOneRelationships ?? []) as unknown as RawManyToOne[]);

  const attributes: AttributeMetadata[] = (raw.Attributes ?? [])
    .filter((a) => a.LogicalName && a.AttributeType !== undefined)
    .map((a): AttributeMetadata => {
      const kind = mapAttributeKind(a.AttributeTypeName?.Value);
      // The Web API returns RequiredLevel.Value as a string ("ApplicationRequired"),
      // although the SDK types model it as a numeric enum key.
      const required = a.RequiredLevel?.Value as unknown as string;
      const base: AttributeMetadata = {
        logicalName: a.LogicalName,
        displayName: localizedLabel(a.DisplayName) || a.LogicalName,
        kind,
        attributeType: a.AttributeTypeName?.Value ?? String(a.AttributeType),
        isWritable: Boolean(a.IsValidForCreate || a.IsValidForUpdate) && !a.IsLogical,
        isRequired: required === "ApplicationRequired" || required === "SystemRequired",
        isPrimaryId: Boolean(a.IsPrimaryId),
        isPrimaryName: Boolean(a.IsPrimaryName),
        maxLength: undefined,
      };

      if (kind === "Lookup") {
        const rels = manyToOne.filter(
          (r) => r.ReferencingAttribute === a.LogicalName,
        );
        const targets: LookupTarget[] = rels.map((r) => ({
          logicalName: r.ReferencedEntity,
          navigationProperty: r.ReferencingEntityNavigationPropertyName,
          // Enriched later from the target entity's own metadata:
          entitySetName: "",
          displayName: r.ReferencedEntity,
          primaryIdAttribute: "",
          primaryNameAttribute: "",
        }));
        base.lookup = {
          kind: targets.length > 1 ? "polymorphic" : "simple",
          targets,
        };
      }

      return base;
    });

  return {
    logicalName: raw.LogicalName,
    displayName: localizedLabel(raw.DisplayName) || raw.LogicalName,
    displayCollectionName: localizedLabel(raw.DisplayCollectionName) || raw.LogicalName,
    entitySetName: raw.EntitySetName,
    primaryIdAttribute: raw.PrimaryIdAttribute,
    primaryNameAttribute: raw.PrimaryNameAttribute,
    isActivity: Boolean(raw.IsActivity),
    attributes,
  };
}

export class MetadataService {
  private readonly entityCache = new Map<string, Promise<EntityMetadata>>();

  constructor(private readonly client: DataverseClient) {}

  /** Full entity metadata with attributes and enriched lookup targets. Cached. */
  getEntity(logicalName: string): Promise<EntityMetadata> {
    const cached = this.entityCache.get(logicalName);
    if (cached) return cached;
    const p = this.loadEntity(logicalName);
    this.entityCache.set(logicalName, p);
    return p;
  }

  private async loadEntity(logicalName: string): Promise<EntityMetadata> {
    const raw = await this.client.getEntityMetadata(logicalName, {
      metadata: ENTITY_META_FIELDS,
      schema: { columns: "all", manyToOne: true },
    });
    const entity = normalizeEntityMetadata(raw);
    await this.enrichLookupTargets(entity);
    return entity;
  }

  /** Fill entity-set / primary attributes on each lookup target. */
  private async enrichLookupTargets(entity: EntityMetadata): Promise<void> {
    const targets = (entity.attributes ?? [])
      .flatMap((a) => a.lookup?.targets ?? []);
    const uniqueLogicalNames = [...new Set(targets.map((t) => t.logicalName))];
    const summaries = new Map<string, EntitySummary>();
    await Promise.all(
      uniqueLogicalNames.map(async (ln) => {
        try {
          summaries.set(ln, await this.getEntitySummary(ln));
        } catch {
          // Target not accessible as a data source; leave it un-enriched.
        }
      }),
    );
    for (const t of targets) {
      const s = summaries.get(t.logicalName);
      if (!s) continue;
      t.entitySetName = s.entitySetName;
      t.displayName = s.displayName;
      t.primaryIdAttribute = s.primaryIdAttribute;
      t.primaryNameAttribute = s.primaryNameAttribute;
    }
  }

  /** Lightweight summary (no attributes/relationships). Cached via getEntity. */
  async getEntitySummary(logicalName: string): Promise<EntitySummary> {
    const raw = await this.client.getEntityMetadata(logicalName, {
      metadata: ENTITY_META_FIELDS,
      schema: { columns: [] },
    });
    return {
      logicalName: raw.LogicalName,
      displayName: localizedLabel(raw.DisplayName) || raw.LogicalName,
      displayCollectionName:
        localizedLabel(raw.DisplayCollectionName) || raw.LogicalName,
      entitySetName: raw.EntitySetName,
      primaryIdAttribute: raw.PrimaryIdAttribute,
      primaryNameAttribute: raw.PrimaryNameAttribute,
    };
  }

  /** Only the lookup attributes of an entity — powers the "Lookups only" filter. */
  async getLookupAttributes(logicalName: string): Promise<AttributeMetadata[]> {
    const entity = await this.getEntity(logicalName);
    return (entity.attributes ?? []).filter((a) => a.kind === "Lookup");
  }

  clearCache(): void {
    this.entityCache.clear();
  }
}
