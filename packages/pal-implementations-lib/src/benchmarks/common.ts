import { Screen } from '@unblessed/node';

export const DEFAULT_ASSET_SCALE = 2;

export interface IUiPage {
  deactivate(screen: Screen): Promise<void>;
  activate(screen: Screen): Promise<void>;
}

export interface ISettingsData {
  testIdPrefix: string;
  kafkaUrl: string;
  assetCode: string;
  peerId: string;
  disableConsoleLog: boolean;
}
