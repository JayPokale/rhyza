import { Box, Form, Screen, Text, Textbox, Button } from '@unblessed/node';
import { ISettingsData, IUiPage } from '../common';

export class SettingsPage implements IUiPage {
  private _containerBox: Box;
  private _form: Form;
  private _data: ISettingsData;

  private _textBoxTestPrefix: Textbox;
  private _textBoxAssetCode: Textbox;
  private _textBoxKafkaUrl: Textbox;
  private _textBoxPeerId: Textbox;

  constructor(data: ISettingsData) {
    this._data = data;

    this._containerBox = new Box({
      top: 6,
      left: 0,
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

    // this._containerBox.on('focus', () => {
    //   this._textBoxTestPrefix.focus();
    // });

    this._form = new Form({
      parent: this._containerBox,
      top: 0,
      left: 2,
      width: '100%-6',
      keys: true,
      vi: true
    });

    this._textBoxTestPrefix = this._createFormTextItem(
      'Test Prefix',
      'testPrefix',
      0,
      this._data.testIdPrefix || ''
    );

    this._textBoxAssetCode = this._createFormTextItem(
      'Asset Code',
      'assetCode',
      1,
      this._data.assetCode || ''
    );

    this._textBoxKafkaUrl = this._createFormTextItem(
      'Kafka URL',
      'kafkaUrl',
      2,
      this._data.kafkaUrl || ''
    );

    this._textBoxPeerId = this._createFormTextItem(
      'Peer ID',
      'peerId',
      3,
      this._data.peerId || ''
    );

    // Submit/Cancel buttons
    const submitBtn = new Button({
      parent: this._form,
      name: 'submit',
      content: 'Save',
      bottom: 0,
      right: 10,
      shrink: true,
      padding: {
        top: 1,
        right: 2,
        bottom: 1,
        left: 2
      },
      style: {
        bold: true,
        fg: 'white',
        bg: 'green',
        focus: {
          inverse: true
        }
      }
    });

    const cancelBtn = new Button({
      parent: this._form,
      name: 'cancel',
      content: 'Reset',
      bottom: 0,
      right: 0,
      shrink: true,
      padding: {
        top: 1,
        right: 2,
        bottom: 1,
        left: 2
      },
      style: {
        bold: true,
        fg: 'white',
        bg: 'red',
        focus: {
          inverse: true
        }
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    submitBtn.on('press', (data: any) => {
      this._formSubmit(data);
    });
    cancelBtn.on('press', () => {
      this._formReset();
    });

    this._form.on('submit', (data: never) => {
      this._formSubmit(data);
    });
  }

  private _formReset() {
    this._textBoxTestPrefix.setValue(this._data.testIdPrefix);
    this._textBoxAssetCode.setValue(this._data.assetCode);
    this._textBoxKafkaUrl.setValue(this._data.kafkaUrl);
    this._textBoxPeerId.setValue(this._data.peerId);
    this._containerBox.render();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/no-explicit-any
  private _formSubmit(data: any) {
    console.log('form submit');
    this._data.testIdPrefix = this._textBoxTestPrefix.getValue();
    this._data.assetCode = this._textBoxAssetCode.getValue();
    this._data.kafkaUrl = this._textBoxKafkaUrl.getValue();
    this._data.peerId = this._textBoxPeerId.getValue();
    this._containerBox.render();
  }

  private _createFormTextItem(
    label: string,
    fieldName: string,
    order: number,
    value: string,
    labelWidth: number = 15
  ): Textbox {
    // we need it to start from 0
    new Text({
      parent: this._form,
      top: order * 4 + 1,
      left: 0,
      content: label
    });
    const textBox = new Textbox({
      parent: this._form,
      name: fieldName,
      top: order * 4,
      left: labelWidth,
      height: 3,
      shadow: true,
      inputOnFocus: true,
      value: value || '',
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'black',

        focus: {
          inverse: true
        }
      }
    });
    return textBox;
  }

  async activate(screen: Screen): Promise<void> {
    screen.append(this._containerBox);
    this._textBoxTestPrefix.focus();
  }
  async deactivate(screen: Screen): Promise<void> {
    screen.remove(this._containerBox);
  }
}
