import { randomBytes } from 'node:crypto';
import {
  Box,
  Screen,
  Element,
  NodeRuntime,
  setRuntime,
  Listbar
} from '@unblessed/node';
import {
  SettingsPage
} from './uiPages/settings';

import { LoadTestsPage } from './uiPages/loadTests';
import { ISettingsData, IUiPage } from './common';
import { LoadTests } from './load';
import process from 'process';
import { OpenTelemetryService } from 'implementations-lib';
import crypto from 'crypto';
import { ILogger, NullLogger } from 'common-types-lib';

// should not have to do this, but it fails without it
const runtime = new NodeRuntime();
setRuntime(runtime);


const BC_NAME = 'PAL';
const APP_NAME = `${BC_NAME}_LEDGER_LOAD_TEST`;
const APP_VERSION = '0.0.1';
const INSTANCE_ID = `${APP_NAME}_${crypto.randomUUID()}`;

const TITLE = 'Rafiki V2 PAL Ledger Benchmarks';
const MENU_ITEMS = ["Settings", "Create Ledger", "Load Test", "Quit"];

const TRANSACTION_COUNT = process.env['TRANSACTION_COUNT']
  ? parseInt(process.env['TRANSACTION_COUNT'])
  : 10;

const KAFKA_URL =
  process.env['KAFKA_URL'] || '127.0.0.1:19092,127.0.0.1:29092,127.0.0.1:39092';
const OPEN_TELEMETRY_COLLECTOR_URL =
  process.env['OPEN_TELEMETRY_COLLECTOR_URL'] || 'http://127.0.0.1:4317';


const settingsData: ISettingsData = {
  testIdPrefix: `${randomBytes(3).toString('hex')}_`,
  kafkaUrl: KAFKA_URL,
  assetCode: 'EUR',
  peerId: 'peerOne',
  disableConsoleLog: true
};

const logger: ILogger = new NullLogger();

OpenTelemetryService.Start(
  BC_NAME,
  APP_NAME,
  APP_VERSION,
  INSTANCE_ID,
  logger,
  OPEN_TELEMETRY_COLLECTOR_URL
);

const loadTests = new LoadTests(
  settingsData,
  TRANSACTION_COUNT,
  logger,
  INSTANCE_ID,
  OpenTelemetryService.getInstance()
);

//1. Create the main screen object (acts as the ncurses canvas)
const screen = new Screen({
  smartCSR: true,
  sendFocus: true,
  autoPadding: true,
  title: TITLE,
  cursor: {
    artificial: false,
    shape: 'line',
    blink: true,
    color: 'red'
  }
});

// Header Box
new Box({
  parent: screen,
  top: 0,
  left: 0,
  width: '100%',
  height: 3,
  focusable: false,
  valign: 'middle',
  content: '{center}{bold}' + TITLE + '{/bold}{/center}',
  tags: true,
  style: {
    fg: 'black',
    bg: 'dark-green'
  }
});

// List Menu (Left Panel)
const menu = new Listbar({
  parent: screen,
  top: 3,
  left: 0,
  width: '100%',
  height: 3,
  label: ' Navigation ',
  items: MENU_ITEMS,
  keys: true,
  mouse: true,
  border: {
    type: 'line'
  },
  style: {
    item: {
      bg: 'black',
      fg: 'white',
      bold: true
    },
    selected: {
      bg: 'red'
    },
    border: {
      fg: 'white'
    },
    focus: {
      border: {
        fg: 'green'
      }
    }
  }
});

// Footer Status Bar
const footer = new Box({
  parent: screen,
  bottom: 0,
  left: 0,
  width: '100%',
  height: 3,
  focusable: false,
  tags: true,
  border: { type: 'line' },
  // content:
  //   '[UP]/[DOWN]/[ENTER] to navigate and select | [TAB] to change fields | [ESCAPE] to go to the menu | [Q] or [Ctrl+C] to quit',
  content:
    '{center}{green-fg}●{/} Connected  {gray-fg}|{/}  {cyan-fg}4 files in context{/}  {gray-fg}|{/}  {yellow-fg}Press Ctrl+C to exit{/}{/center}',
  style: {
    fg: 'yellow',
    bg: 'black'
  }
});

function updateFooter(){
  const separator = " {gray-fg}|{/} ";
  const connState = loadTests.connected
    ? '{center}{green-fg}● connected'
    : '{center}{red-fg}● disconnected';
  const runState = loadTests.isRunning
    ? `{green-fg}● ${loadTests.perSecCount}/sec `
    : '{red-fg}● (not running)';

  const shortcuts = "{yellow-fg}Press C to setup ledger - Ctrl+C to exit{/}{/center}";
  footer.content = connState + separator + runState + separator + shortcuts;
  screen.render();
}
updateFooter();

loadTests.on('stateChanged', ()=>{
  updateFooter();
});


// Content Box Pages (Right Panel)
const settingsPage = new SettingsPage(settingsData);
const loadTestsPage = new LoadTestsPage(settingsData, loadTests);

let currentPage: IUiPage;
async function navigateToPage(newPage: IUiPage) {
  if(currentPage) await currentPage.deactivate(screen)
  await newPage.activate(screen);
  currentPage = newPage;
  screen.render();
}

// Nav Event Handling
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function navHandlerCallback(item: Element, index: number) {
  const selectedIndex = menu.selected;
  if (selectedIndex == MENU_ITEMS.length - 1) {
    return process.exit(0);
  }

  if (selectedIndex === 0) {
    await navigateToPage(settingsPage);
    //screen.focusOffset(2);
  } else if (selectedIndex === 2) {
    await navigateToPage(loadTestsPage);
    //screen.focusOffset(3);
  }

  //screen.render(); // Re-render terminal buffer
}

menu.on('select', navHandlerCallback);
menu.on('element click', navHandlerCallback);

screen.key(['1'], () => {
  menu.selectTab(0);
});
screen.key(['2'], () => {
  menu.selectTab(1);
});
screen.key(['3'], () => {
  // menu.selectTab(2);
  menu.select(2);
});

screen.key(['s'], async () => {
  await loadTests.startOrStop();
});

screen.key(['c'], async () => {
  await loadTests.setupLedger();
});

screen.key(['C-r'], async () => {
  screen.realloc();
  screen.render();
});


// Handle quit shortcuts
screen.key(['q', 'C-c'], () => {
  return process.exit(0);
});

// escape always focuses navigation
screen.key(['escape'], () => {
  menu.focus();
});

screen.key(['h'], () => {
// Create a box perfectly centered horizontally and vertically.
  const box = new Box({
    top: 'center',
    left: 'center',
    width: '50%',
    height: '50%',
    content:
      '{center}{green-fg}Help{/}\n[UP]/[DOWN]/[ENTER] to navigate and select \n[TAB] to change fields\n[ESCAPE] to go to the menu\n[Q] or [Ctrl+C] to quit',
    tags: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      bg: 'black',
      border: {
        fg: '#f0f0f0'
      },
      hover: {
        bg: 'green'
      }
    }
  });

// Append our box to the screen.
  screen.append(box);
  box.focus();
  screen.render();
  box.key(['escape'], () => {
    screen.remove(box);
    screen.render();
  });
});

navigateToPage(settingsPage);
// Focus the interactive menu initially
menu.focus();
// Initial screen render
screen.render();



process.on('uncaughtException', (err) => {
  screen.destroy();
  console.error(err);
  process.exit(1);
});
