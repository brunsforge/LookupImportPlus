/**
 * Service container — wires the services on top of one {@link DataverseClient}
 * and holds the (in-memory for MVP) configuration store. Swapping the client
 * (Fake ↔ SDK) rebuilds the whole graph, so the UI never depends on transport.
 */

import type { DataverseClient } from "@/data/DataverseClient";
import type { JobConfiguration } from "@/domain/config";
import { MetadataService } from "@/services/MetadataService";
import { LookupResolver } from "@/services/LookupResolver";
import { ImportRunner } from "@/services/ImportRunner";
import { ConfigValidationService } from "@/services/ConfigValidationService";
import { ViewService } from "@/services/ViewService";
import { DataExportService } from "@/services/DataExportService";
import { ExcelTemplateService } from "@/services/excel/ExcelTemplateService";
import { ExcelParserService } from "@/services/excel/ExcelParserService";
import { MemoryStore, type PersistedStore } from "@/services/PersistedStore";

export class AppContainer {
  readonly metadata: MetadataService;
  readonly resolver: LookupResolver;
  readonly runner: ImportRunner;
  readonly validation: ConfigValidationService;
  readonly views: ViewService;
  readonly export: DataExportService;
  readonly template = new ExcelTemplateService();
  readonly parser = new ExcelParserService();

  private readonly configs = new Map<string, JobConfiguration>();

  constructor(
    readonly client: DataverseClient,
    seedConfigs: JobConfiguration[] = [],
    /** Entities selectable in the editor (tables added as data sources). */
    readonly availableEntities: string[] = [],
    /** Persistence backend (localStorage in the app, in-memory in tests). */
    readonly store: PersistedStore = new MemoryStore(),
  ) {
    this.metadata = new MetadataService(client);
    this.resolver = new LookupResolver(client, this.metadata);
    this.runner = new ImportRunner(client, this.metadata, this.resolver);
    this.validation = new ConfigValidationService(this.metadata);
    this.views = new ViewService(client);
    this.export = new DataExportService(client, this.metadata);

    // Load persisted configs; seed the demo config only on first run.
    const persisted = store.loadConfigs();
    const initial = persisted.length ? persisted : seedConfigs;
    for (const c of initial) this.configs.set(c.id, c);
    if (!persisted.length && seedConfigs.length) store.saveConfigs(seedConfigs);
  }

  listConfigs(): JobConfiguration[] {
    return [...this.configs.values()];
  }

  getConfig(id: string): JobConfiguration | undefined {
    return this.configs.get(id);
  }

  saveConfig(config: JobConfiguration): void {
    this.configs.set(config.id, config);
    this.store.saveConfigs(this.listConfigs());
  }

  deleteConfig(id: string): void {
    this.configs.delete(id);
    this.store.saveConfigs(this.listConfigs());
  }
}
