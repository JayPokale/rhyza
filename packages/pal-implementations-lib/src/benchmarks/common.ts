import { Screen } from '@unblessed/node';

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
