/**
 * Canned raw Dataverse metadata for offline dev/tests: `account` and `contact`.
 * Only the fields the app reads are populated; objects are cast to the full
 * `RawEntityMetadata` shape. `contact.parentcustomerid` is modeled as a
 * polymorphic Customer lookup (account + contact) to exercise that path.
 */

import type { RawEntityMetadata } from "./rawMetadata";

function label(text: string) {
  return { UserLocalizedLabel: { Label: text }, LocalizedLabels: [] };
}

interface AttrSeed {
  logical: string;
  display: string;
  typeName: string;
  required?: "None" | "ApplicationRequired" | "SystemRequired";
  writable?: boolean;
  primaryId?: boolean;
  primaryName?: boolean;
}

function attr(a: AttrSeed) {
  const writable = a.writable ?? true;
  return {
    LogicalName: a.logical,
    DisplayName: label(a.display),
    AttributeType: a.typeName.replace(/Type$/, ""),
    AttributeTypeName: { Value: a.typeName },
    RequiredLevel: { Value: a.required ?? "None" },
    IsValidForCreate: writable,
    IsValidForUpdate: writable,
    IsValidForRead: true,
    IsLogical: false,
    IsPrimaryId: Boolean(a.primaryId),
    IsPrimaryName: Boolean(a.primaryName),
  };
}

function m1(
  referencingAttribute: string,
  referencedEntity: string,
  navProperty: string,
) {
  return {
    ReferencingAttribute: referencingAttribute,
    ReferencingEntity: "contact",
    ReferencedEntity: referencedEntity,
    ReferencingEntityNavigationPropertyName: navProperty,
    ReferencedEntityNavigationPropertyName: `contact_${referencingAttribute}`,
    RelationshipType: 0,
  };
}

const account = {
  LogicalName: "account",
  DisplayName: label("Account"),
  DisplayCollectionName: label("Accounts"),
  EntitySetName: "accounts",
  PrimaryIdAttribute: "accountid",
  PrimaryNameAttribute: "name",
  IsActivity: false,
  Attributes: [
    attr({ logical: "accountid", display: "Account", typeName: "UniqueidentifierType", writable: false, primaryId: true }),
    attr({ logical: "name", display: "Account Name", typeName: "StringType", required: "ApplicationRequired", primaryName: true }),
    attr({ logical: "accountnumber", display: "Account Number", typeName: "StringType" }),
    attr({ logical: "modifiedon", display: "Modified On", typeName: "DateTimeType", writable: false }),
  ],
  ManyToOneRelationships: [],
  OneToManyRelationships: [],
  ManyToManyRelationships: [],
} as unknown as RawEntityMetadata;

const contact = {
  LogicalName: "contact",
  DisplayName: label("Contact"),
  DisplayCollectionName: label("Contacts"),
  EntitySetName: "contacts",
  PrimaryIdAttribute: "contactid",
  PrimaryNameAttribute: "fullname",
  IsActivity: false,
  Attributes: [
    attr({ logical: "contactid", display: "Contact", typeName: "UniqueidentifierType", writable: false, primaryId: true }),
    attr({ logical: "fullname", display: "Full Name", typeName: "StringType", writable: false, primaryName: true }),
    attr({ logical: "firstname", display: "First Name", typeName: "StringType" }),
    attr({ logical: "lastname", display: "Last Name", typeName: "StringType", required: "ApplicationRequired" }),
    attr({ logical: "parentcustomerid", display: "Company Name", typeName: "CustomerType" }),
    attr({ logical: "createdon", display: "Created On", typeName: "DateTimeType", writable: false }),
  ],
  // Polymorphic Customer lookup → account + contact, each with its own nav prop.
  ManyToOneRelationships: [
    m1("parentcustomerid", "account", "parentcustomerid_account"),
    m1("parentcustomerid", "contact", "parentcustomerid_contact"),
  ],
  OneToManyRelationships: [],
  ManyToManyRelationships: [],
} as unknown as RawEntityMetadata;

export const FAKE_METADATA: Record<string, RawEntityMetadata> = {
  account,
  contact,
};

export const FAKE_ENTITYSET_BY_LOGICAL: Record<string, string> = {
  account: "accounts",
  contact: "contacts",
};
