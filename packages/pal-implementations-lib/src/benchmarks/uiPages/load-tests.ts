import {
  Box,
  Screen,
  Text,
  Button,
  Log,
  ButtonOptions,
  Static,
  Alignment,
  BoxOptions,
  Textbox
} from '@unblessed/node';

import { ISettingsData, IUiPage } from '../common';
import { ILoadTestStats, LoadTests } from '../load';



export class LoadTestsPage implements IUiPage {
  // private _buttonsBox: Element;
  private _data: ISettingsData;
  private _loadTests: LoadTests;

  private _containerBox!: Box;
  private _text1!: Textbox;
  private _text2!: Text;
  private _text3!: Text;
  private _log!: Log;
  // private _setupLedgerBtn!: Button;
  // private _startBtn!: Button;
  // private _stopBtn!: Buttons;

  constructor(data: ISettingsData, loadTests: LoadTests) {
    this._data = data;
    this._loadTests = loadTests;

    this._createUiElements();
    this._hookUiHandlers();

    this._loadTests.on('logAvailable', (logLine: string) => {
      this._log.log(`LOG: ${logLine}`);
      this._log.setScrollPerc?.(100);
      this._log.screen.render();
    });

    this._loadTests.on('statsAvailable', (stats: ILoadTestStats) => {
      // this._text1.setContent(
      //   `${stats.isRunning ? '{green-fg}' : '{red-fg}'}${stats.perSecCount}{/}`
      // );
      this._text2.setContent(
        Math.round(stats.avgTimePerMessageMs).toString() + ' ms'
      );
      this._text3.setContent(Math.round(stats.totalMessagesPending).toString());
    });
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

    const commonText: BoxOptions = {
      top: 0,
      height: 3,
      width: 20,
      tags: true,
      parent: this._containerBox,
      border: { type: 'line' },
      style: {
        fg: 'green',
        bg: 'black'
      },
      focusable: false
    };

    // this._text1 = new Box({
    new Box({
      ...commonText,
      left: 1,
      label:  'Req/sec',
    });
    this._text1 = new Textbox({
      parent: this._containerBox,
      name: "reqspersec",
      top: 1,
      left: 2,
      height: 1,
      width: 18,
      align: "right",
      shadow: true,
      inputOnFocus: true,
      value: this._loadTests.perSecCount.toString(),
      style: {
        fg: 'white',
        bg: 'black',
        focus: {
          inverse: true
        }
      }
    });

    this._text2 = new Box({
      ...commonText,
      left: 21,
      label: 'Avg resp time'
    });

    this._text3 = new Box({
      ...commonText,
      left: 41,
      label: 'Pending',
      style: {
        fg: 'red'
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
          bg: 'yellow',
        },
      },
      scrollOnInput: true
    });

  }

  private _hookUiHandlers() {
    this._text1.on("submit", (data:string)=>{
      console.log(data);
      this._loadTests.perSecCount = parseInt(data);
    });
  }

  async activate(screen: Screen): Promise<void> {
    screen.append(this._containerBox);

    console.log = console.debug = (args) => {
      this._log.log(args);
      this._log.screen.render();
    };

    await this._loadTests.init();
    screen.render();
  }
  async deactivate(screen: Screen): Promise<void> {
    screen.remove(this._containerBox);
  }
}
