import { ISettingsData, IUiPage } from '../common';
import { Box, Log, Screen } from '@unblessed/node';
import { PalClient } from 'pal-client-lib';
import {
  IPalPeerDto,
  ILedgerAccountDto,
  IPalAssetDto
} from 'pal-public-types-lib';
import { LoadTests } from '../load';

export class LedgerSettingsPage implements IUiPage {
  private _data: ISettingsData;
  private _loadTests: LoadTests;
  private _apiClient: PalClient;

  private _containerBox!: Box;
  private _log!: Log;

  private _asset: IPalAssetDto | null;
  private _peer: IPalPeerDto | null;
  private _accounts: ILedgerAccountDto[];

  constructor(data: ISettingsData, loadTests: LoadTests, apiClient: PalClient) {
    this._data = data;
    this._loadTests = loadTests;
    this._apiClient = apiClient;

    this._asset = null;
    this._peer = null;
    this._accounts = [];

    this._createUiElements();
    this._hookUiHandlers();
  }

  private _createUiElements() {
    this._containerBox = new Box({
      top: 6,
      left: 0,
      focusable: false,
      width: '100%',
      height: '100%-9',
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: 'green'
        }
      }
    });

    this._log = new Log({
      parent: this._containerBox,
      top: 3,
      left: 1,
      height: '100%-5',
      width: '100%-4',
      scrollable: true,
      alwaysScroll: true,
      scrollback: 1000,
      keys: true,
      focusable: true,
      vi: true,
      border: {
        type: 'line'
      },
      // staticHeader: '=== Application Logs ===',
      // staticFooter: '[↑/↓] Scroll | [Q] Quit',
      scrollbar: {
        ch: '█',
        style: { bg: 'cyan' },
        track: {
          bg: 'yellow'
        }
      },
      scrollOnInput: true
    });

    // const commonButton: Partial<ButtonOptions> = {
    //   parent: this._containerBox,
    //   shrink: true,
    //   mouse: true,
    //   padding: {
    //     top: 1,
    //     right: 2,
    //     bottom: 1,
    //     left: 2
    //   },
    //   focusable: true,
    //   style: {
    //     bold: true,
    //     fg: 'red',
    //     bg: 'white',
    //     focus: {
    //       inverse: true
    //     }
    //   }
    // };
    //
    //
    //   this._startBtn = new Button({
    //     ...commonButton,
    //     name: 'start',
    //     content: 'Start',
    //     bottom: 0,
    //     left: 16
    //   });
    //   this._stopBtn = new Button({
    //     ...commonButton,
    //     name: 'stop',
    //     content: 'Stop',
    //     bottom: 0,
    //     right: 26
    //   });
  }

  private _hookUiHandlers() {}

  async activate(screen: Screen): Promise<void> {
    screen.append(this._containerBox);

    console.log = console.debug = (args) => {
      this._log.log(args);
      this._log.screen.render();
    };

    // this._loadTests.on('logAvailable', (logLine: string) => {
    //   this._log.log(`LOG: ${logLine}`);
    //   this._log.setScrollPerc?.(100);
    //   this._log.screen.render();
    // });

    if (!this._loadTests.connected) {
      this._log.log('Connecting to api...');
      await this._loadTests.init();
      this._log.log('Connected to api.');
    }

    if (this._loadTests.asset) {
      this._log.log(`Asset: ${this._loadTests.asset.code} exists.`);
    }
    if (this._loadTests.peer) {
      this._log.log(`Peer: ${this._loadTests.peer.name} exists.`);
    }
    if (this._loadTests.accounts.length > 0) {
      this._log.log(
        `Accounts: ${this._loadTests.accounts.length} accounts found.`
      );
    }

    this._log.screen.render();

    screen.render();
  }
  async deactivate(screen: Screen): Promise<void> {
    screen.remove(this._containerBox);
  }
}
