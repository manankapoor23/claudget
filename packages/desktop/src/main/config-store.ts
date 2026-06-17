import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG, mergeConfig, resolveConfig, type WidgetConfig } from '@claude-widget/core';

/**
 * Persists {@link WidgetConfig} as a human-editable JSON file under the app's
 * userData directory. Invalid hand-edits are repaired field-by-field on load
 * (via core's `resolveConfig`), so the file can be safely edited by hand.
 */
export class ConfigStore {
  readonly filePath: string;
  private config: WidgetConfig;

  constructor(dir: string) {
    this.filePath = path.join(dir, 'config.json');
    this.config = this.load();
  }

  private load(): WidgetConfig {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as unknown;
      return resolveConfig(raw);
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  get(): WidgetConfig {
    return this.config;
  }

  set(patch: Partial<WidgetConfig>): WidgetConfig {
    this.config = mergeConfig(this.config, patch);
    this.save();
    return this.config;
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, `${JSON.stringify(this.config, null, 2)}\n`, 'utf8');
    } catch {
      // Surfaced by the caller's logger; never throw from a setter.
    }
  }
}
