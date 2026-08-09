#!/usr/bin/env node
import blessed from 'blessed';

const TITLE = 'Rafiki V2 PAL Ledger Benchmarks';

const MENU_ITEMS = ["Settings", "Create Ledger", "Load Test", "Quit"];

// 1. Create the main screen object (acts as the ncurses canvas)
const screen = blessed.screen({
  smartCSR: true,
  title: TITLE,
  cursor: {
    artificial: true,
    shape: 'line',
    blink: true,
    color: 'red',
  },
});

// 2. Add a Header Box
const header = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: 2,
  content: '{center}{bold}' + TITLE + '{/bold}{/center}',
  tags: true,
  style: {
    fg: 'white',
    bg: 'black',
  },
});

// 3. Add an interactive List Menu (Left Panel)
const menu = blessed.list({
  top: 2,
  left: 0,
  width: '100',
  height: '100%-3',
  label: ' Navigation ',
  items: MENU_ITEMS,
  keys: true,
  mouse: true,
  border: {
    type: 'line',
  },
  style: {
    selected: {
      bg: 'cyan',
      fg: 'black',
      bold: true,
    },
    border: {
      fg: 'blue',
    },
  },
});

// 4. Add a Content Box (Right Panel)
const settingsBox = blessed.box({
  top: 2,
  left: '100',
  width: '100%-20',
  height: '100%-3',
  label: ' Settings',
  content: 'Select an item from the menu to view details. - SETTINGS',
  border: {
    type: 'line',
  },
  style: {
    border: {
      fg: 'green',
    },
  },
});

var msg = blessed.message({
  parent: screen,
  top: 40,
  left: 5,
  style: {
    italic: true,
    fg: 'green'
  }
});

var form = blessed.form({
  parent: settingsBox,
  width: '90%',
  left: 'center',
  keys: true,
  vi: true
});
var label1 = blessed.text({
  parent: settingsBox,
  top: 3,
  left: 5,
  content: 'FIRST NAME:'
});
var textarea = blessed.textarea({
  parent: form,
  name: 'comments',
  top: 26,
  left: 5,
  height: 7,
  inputOnFocus: true,
  border: {
    type: 'line'
  }
});

// Submit/Cancel buttons
var submit = blessed.button({
  parent: form,
  name: 'submit',
  content: 'Submit',
  top: 35,
  left: 5,
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
var reset = blessed.button({
  parent: form,
  name: 'reset',
  content: 'Reset',
  top: 35,
  left: 15,
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
form.on('submit', function (data) {
  msg.display('Form submitted!', (res)=>{
    console.log(res);
  });
  // var editors = ['Vim', 'Emacs', 'Atom', 'Brackets'].filter(function (item, index) {
  //   return data.editors[index];
  // });
  // msg.display('Form submitted!', function () {
  //   var summary = '';
  //   summary += data.firstname + ' ' + data.lastname + '\n';
  //   summary += '------------------------------\n';
  //   summary += 'Favorite editors: ' + editors + '\n';
  //   summary += 'Likes Blessed: ' + data.like[0] + '\n';
  //   summary += 'Comments: ' + data.comments;
  //   fs.writeFile('form-data.txt', summary, function (err) {
  //     if (err) throw err;
  //   });
  // });
});

const loadTestsBox = blessed.box({
  top: 2,
  left: '100',
  width: '100%-20',
  height: '100%-3',
  label: ' Load Tests',
  content: 'Select an item from the menu to view details. - loadTestsBox',
  border: {
    type: 'line',
  },
  style: {
    border: {
      fg: 'green',
    },
  },
});


// 5. Add a Footer Status Bar
const footer = blessed.box({
  bottom: 0,
  left: 0,
  width: '100%',
  height: 1,
  content: ' Use [UP]/[DOWN] arrows to navigate | Press [Q] or [Ctrl+C] to quit',
  style: {
    fg: 'yellow',
    bg: 'black',
  },
});

// Mount widgets onto the main screen
screen.append(header);
screen.append(menu);
screen.append(settingsBox);
screen.append(footer);

let currentMainBox = settingsBox;
function replaceMainBox(newBox: blessed.Widgets.BoxElement){
  screen.remove(currentMainBox);
  screen.append(newBox);
  currentMainBox = newBox;

  newBox.focus();
}

// 6. Nav Event Handling
function navHandlerCallback(item: blessed.Widgets.BoxElement, index: number){
  const selectedText = item.getText();

  if (selectedText === MENU_ITEMS[MENU_ITEMS.length - 1]) {
    return process.exit(0);
  }

  if(selectedText === MENU_ITEMS[0]){
    replaceMainBox(settingsBox);
  }else if(selectedText === MENU_ITEMS[1]){
    replaceMainBox(loadTestsBox);
  }

  screen.render(); // Re-render terminal buffer
}
menu.on('select', navHandlerCallback);
menu.on('element click', navHandlerCallback);


// Handle quit shortcuts
screen.key(['q', 'C-c'], () => {
  return process.exit(0);
});

screen.key(['h'], () => {
// Create a box perfectly centered horizontally and vertically.
  var box = blessed.box({
    top: 'center',
    left: 'center',
    width: '50%',
    height: '50%',
    content: 'Hello {bold}world{/bold}!',
    tags: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      bg: 'magenta',
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
  });
});


// Focus the interactive menu initially
menu.focus();

// Initial screen render
screen.render();
