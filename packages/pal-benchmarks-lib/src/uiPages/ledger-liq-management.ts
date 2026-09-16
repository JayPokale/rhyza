import { ISettingsData,  UiPage } from '../common';
import { Box} from '@unblessed/node';
import { PalClient } from 'pal-client-lib';
import {
  IPalPeerDto,
  ILedgerAccountDto,
  IPalAssetDto
} from 'pal-public-types-lib';
import { LoadTests } from '../load';

export class LedgerLiquidityManagementPage extends UiPage {
  private _loadTests: LoadTests;
  private _apiClient: PalClient;

  private _log!: Box;

  constructor(data: ISettingsData, loadTests: LoadTests, apiClient: PalClient) {
    super(data);
    this._loadTests = loadTests;
    this._apiClient = apiClient;
  }

  protected async _onActivated():Promise<void> {
    if (!this._loadTests.connected) {
      this._log.pushLine('Connecting to api...');
      await this._loadTests.init();
      this._log.pushLine('Connected to api.');
    }

    if (this._loadTests.asset) {
      this._log.pushLine(`Asset: ${this._loadTests.asset.code} exists.`);
    }
    if (this._loadTests.peer) {
      this._log.pushLine(`Peer: ${this._loadTests.peer.name} exists.`);
    }
    if (this._loadTests.accounts.length > 0) {22
      this._log.pushLine(
        `Accounts: ${this._loadTests.accounts.length} accounts found.`
      );
    }
  }
  protected async _onDeactivated():Promise<void> {}

  protected _createUiElements() {
    this._log = new Box({
      parent: this._containerBox,
      top: 3,
      left: 1,
      height: '100%-5',
      width: '100%-4',
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      focusable: true,
      vi: true,
      border: {
        type: 'line'
      },
      scrollbar: {
        ch: '█',
        style: { bg: 'cyan' },
        track: {
          bg: 'yellow'
        }
      }
    });
  }

  protected _hookUiHandlers() {}
}
