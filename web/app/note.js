var t = `
<div class="relative flex h-full">
  <div class="flex flex-col grow overflow-y-auto">
    <div ref="codemirror"
      @keydown.[.exact="handleLeftBracket"
      class="h-full p-2 pr-1 pb-px cm-links-hover"
      :class="{'cm-conceal cm-unconceal': $notesiumState.editorConcealFormatting, 'cm-fat-cursor': fatCursor}"></div>
    <NoteStatusbar :note=note :vimMode=vimMode :hasFocus=hasFocus
      @note-delete="(...args) => $emit('note-delete', ...args)"
      @finder-open="(...args) => $emit('finder-open', ...args)" />
  </div>

  <div v-if="!$notesiumState.showNoteSidebar || note.ghost" class="absolute right-0 mt-2 mr-4 h-7 z-10 inline-flex items-center">
    <button type="button" :disabled="!this.note.isModified" @click="handleSave()"
      :class="this.note.isModified ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-gray-300 text-gray-400'"
      class="rounded px-10 py-1.5 text-xs">Save</button>
    <span v-if="!note.ghost" title="sidebar" @click="$notesiumState.showNoteSidebar=true"
      class="ml-2 cursor-pointer text-gray-400 hover:text-gray-600">
      <Icon name="outline-information-circle" size="h-5 w-5" />
    </span>
  </div>

  <NoteSidebar v-if="$notesiumState.showNoteSidebar && !note.ghost" :note=note
    @note-save="handleSave()"
    @note-open="(...args) => $emit('note-open', ...args)"
    @note-delete="(...args) => $emit('note-delete', ...args)"
    @finder-open="(...args) => $emit('finder-open', ...args)" />

  <Finder v-if="showFinder" uri="/api/raw/list?sort=mtime" small=true @finder-selection="handleFinderSelection" />
</div>
`

import * as Table from './cm-table.js';
import NoteSidebar from './note-sidebar.js'
import NoteStatusbar from './note-statusbar.js'
import Finder from './finder.js'
import Icon from './icon.js'
export default {
  components: { NoteSidebar, NoteStatusbar, Finder, Icon },
  props: ['note', 'activeTabId'],
  emits: ['note-open', 'note-close', 'note-save', 'note-delete', 'finder-open'],
  data() {
    return {
      hasFocus: false,
      vimMode: null,
      fatCursor: false,
      showFinder: false,
      selectedLines: [],
    }
  },
  methods: {
    simulateDoubleLeftBracket() {
      if (this.$notesiumState.editorVimMode && this.vimMode.mode !== 'insert' ) return CodeMirror.Pass;
      const cursorPos = this.cm.getCursor();
      this.cm.replaceRange('[', cursorPos, cursorPos);
      this.showFinder = true;
    },
    handleLeftBracket(e) {
      if (this.$notesiumState.editorVimMode && this.vimMode.mode !== 'insert' ) return;
      e.preventDefault();

      const cursorPos = this.cm.getCursor();
      const startPos = { line: cursorPos.line, ch: cursorPos.ch - 1 };
      const prevChar = this.cm.getRange(startPos, cursorPos);

      const now = Date.now();
      const timeSinceLastPress = now - (this.lastBracketPressTime || 0);
      const threshold = 2000;

      if (prevChar === '[' && timeSinceLastPress < threshold) {
        this.showFinder = true;
      } else {
        this.cm.replaceRange('[', cursorPos, cursorPos);
        this.lastBracketPressTime = now;

        this.fatCursor = true;
        const restoreCursor = () => { this.fatCursor = false; this.cm.off('keydown', restoreCursor); };
        this.cm.on('keydown', restoreCursor);
        setTimeout(() => { restoreCursor(); }, threshold);
      }
    },
    handleFinderSelection(value) {
      this.showFinder = false;

      const cursorPos = this.cm.getCursor();
      const startPos = { line: cursorPos.line, ch: cursorPos.ch - 1 };
      let formattedLink = '';
      if (value) formattedLink = `[${value.Content}](${value.Filename})`;
      this.cm.replaceRange(formattedLink, startPos, cursorPos);

      this.$nextTick(() => {
        this.cm.focus();
        this.cm.refresh();
        if (this.$notesiumState.editorVimMode) {
          CodeMirror.Vim.handleKey(this.cm, "a");
        }
      });
    },
    handleSave() {
      if (this.note.isModified) {
        const timestamp = this.note.ghost ? this.note.Ctime : this.note.Mtime;
        this.$emit('note-save', this.note.Filename, this.cm.getValue(), timestamp, this.note.ghost);
      }
      if (this.$notesiumState.editorVimMode) {
        CodeMirror.Vim.exitInsertMode(this.cm)
      }
    },
    handleTab() {
      if (this.$notesiumState.editorVimMode && this.vimMode.mode !== 'insert' ) return;
      if (this.cm.somethingSelected()) return CodeMirror.Pass;
      if (Table.isCursorInTable(this.cm)) {
        Table.formatTableAndAdvance(this.cm, this.$notesiumState.editorConcealFormatting);
      } else {
        this.cm.execCommand('insertSoftTab');
      }
    },
    handleBackspace() {
      if (this.cm.somethingSelected()) return CodeMirror.Pass;
      const cursorPos = this.cm.getCursor();
      const indentUnit = this.cm.getOption('indentUnit');
      const spacesForIndentUnit = ' '.repeat(indentUnit);
      const checkFrom = {line: cursorPos.line, ch: Math.max(0, cursorPos.ch - indentUnit)};
      if (this.cm.getRange(checkFrom, cursorPos) === spacesForIndentUnit) {
        this.cm.replaceRange('', checkFrom, cursorPos);
      } else {
        return CodeMirror.Pass;
      }
    },
    handleEsc() {
      if (this.$notesiumState.editorVimMode) {
        CodeMirror.Vim.handleEx(this.cm, 'nohlsearch');
        return CodeMirror.Pass;
      }
      this.cm.display.input.blur();
      document.body.focus();
    },
    handleEditorVimMode() {
      if (this.$notesiumState.editorVimMode) {
        this.cm.setOption("keyMap", "vim");
        this.cm.on('vim-mode-change', (e) => { this.vimMode = e; });
        this.cm.on('vim-keypress', (key) => { if (':/?'.includes(key)) this.vimMode = { mode: 'command' }; });
        this.cm.focus();
      } else {
        this.cm.setOption("keyMap", "default");
        this.cm.off('vim-mode-change');
        this.cm.off('vim-keypress');
        this.vimMode = null;
      }
    },
    handleEditorFoldGutter() {
      if (this.$notesiumState.editorFoldGutter) {
        this.cm.setOption("gutters", ["CodeMirror-foldgutter"]);
        this.cm.setOption("foldGutter", true);
      } else {
        this.cm.setOption("gutters", []);
        this.cm.setOption("foldGutter", false);
      }
    },
    foldWidget(from, to) {
      var header = document.createElement("span");
      header.appendChild(document.createTextNode(this.cm.getLine(from.line).trim()));
      header.className = "cm-foldmarker-header";

      var lines = document.createElement("span");
      lines.appendChild(document.createTextNode(`[${to.line - from.line} lines]`));
      lines.className = "cm-foldmarker-lines";

      var widget = document.createElement("span");
      widget.appendChild(header);
      widget.appendChild(lines);
      widget.className = "cm-foldmarker";
      return widget;
    },
    lineNumberHL(linenum) {
      if (!Number.isInteger(linenum) || linenum === undefined) return;
      this.$nextTick(() => {
        this.cm.setOption("styleActiveLine", true);
        this.cm.setCursor({line: linenum - 1});
        this.note.Linenum = undefined;
      });
    },
    handleKeyPress(event) {
      if (event.target.tagName !== 'BODY' || this.note.Filename !== this.activeTabId) return;
      if (event.ctrlKey && event.code === 'KeyS') {
        this.handleSave();
        event.preventDefault();
      }
      if (event.code === 'Tab') {
        this.$nextTick(() => { this.cm.focus(); });
        event.preventDefault();
      }
    },
  },
  mounted() {
    this.cm = new CodeMirror(this.$refs.codemirror, {
      value: this.note.Content,
      placeholder: '# title',
      lineNumbers: false,
      lineWrapping: this.$notesiumState.editorLineWrapping,
      styleActiveLine: false,
      foldOptions: {
        rangeFinder: CodeMirror.fold.markdown,
        markdownIncludeHeader: true,
        widget: this.foldWidget,
        inclusiveRight: true,
        clearOnEnter: false,
        scanUp: true,
      },
      tabSize: 4,
      indentUnit: 4,
      theme: 'notesium-light',
      mode: {
        name: "gfm",
        highlightFormatting: true,
      },
      extraKeys: {
        "Esc": this.handleEsc,
        "Ctrl-S": this.handleSave,
        "Tab": this.handleTab,
        "Backspace": this.handleBackspace,
        "Ctrl-Enter": function(cm) { return cm.execCommand('toggleFold'); },
        "Shift-Tab": function(cm) { return Table.navigateTable(cm, 'left'); },
        "Alt-Up": function(cm) { return Table.navigateTable(cm, 'up'); },
        "Alt-Down": function(cm) { return Table.navigateTable(cm, 'down'); },
        "Alt-Left": function(cm) { return Table.navigateTable(cm, 'left'); },
        "Alt-Right": function(cm) { return Table.navigateTable(cm, 'right'); },
        "Alt-K": this.simulateDoubleLeftBracket,
      },
    });

    if (Number.isInteger(this.note.Linenum) && this.note.Linenum > 1) {
      this.lineNumberHL(this.note.Linenum);
    }

    this.cm.save = () => { this.handleSave(); }
    this.cm.quit = (confirmIfModified) => { this.$emit('note-close', this.note.Filename, confirmIfModified); }
    this.cm.writequit = () => {
      if (!this.note.isModified) {
        this.$emit('note-close', this.note.Filename);
        return;
      }
      const currentMtime = this.note.Mtime;
      const closeWhenSaved = (attempts, interval) => {
        if (attempts <= 0) return;
        setTimeout(() => {
          (currentMtime !== this.note.Mtime) ? this.$emit('note-close', this.note.Filename) : closeWhenSaved(attempts - 1, interval * 2);
          }, interval);
      };
      this.handleSave();
      closeWhenSaved(5, 100);
    }
    this.cm.openlink = (link) => {
      const isMdFile = /^[0-9a-f]{8}\.md$/i.test(link);
      const hasProtocol = /^[a-zA-Z]+:\/\//.test(link);
      (isMdFile) ? this.$emit('note-open', link) : window.open(hasProtocol ? link : 'https://' + link, '_blank');
    }

    this.cm.on('focus', (cm, e) => {
      if (this.$notesiumState.editorVimMode) CodeMirror.Vim.exitInsertMode(this.cm);
      this.cm.setOption("styleActiveLine", true);
      this.hasFocus = true;
    });
    this.cm.on('blur', (cm, e) => {
      if (this.vimMode?.mode == 'command') return;
      this.vimMode = null;
      this.cm.setOption("styleActiveLine", false);
      this.hasFocus = false;
    });
    this.cm.on('changes', (cm, changes) => {
      this.note.isModified = !cm.doc.isClean();
    });
    this.cm.on('cursorActivity', (cm, e) => {
      if (!this.$notesiumState.editorConcealFormatting) return;
      this.selectedLines.forEach(line => {
        cm.removeLineClass(line, 'wrap', 'CodeMirror-selectedline');
      });
      this.selectedLines = [];
      if (cm.somethingSelected()) {
        const from = cm.getCursor("from").line;
        const to = cm.getCursor("to").line;
        for (let line = from; line <= to; line++) {
          cm.addLineClass(line, 'wrap', 'CodeMirror-selectedline');
          this.selectedLines.push(line);
        }
      }
    });

    this.cm.on('mousedown', (cm, e) => {
      let el = e.composedPath()[0];
      if (el.classList.contains('cm-link') || el.classList.contains('cm-url')) {
        const getNextNSibling = (element, n) => { for (; n > 0 && element; n--, element = element.nextElementSibling); return element; };

        if (el.classList.contains('cm-formatting')) {
          switch (el.textContent) {
            case '[': el = getNextNSibling(el, 4); break;
            case ']': el = getNextNSibling(el, 2); break;
            case '(': el = getNextNSibling(el, 1); break;
            case ')': el = el.previousElementSibling; break;
            default: return;
          }
          if (!el?.classList.contains('cm-url')) return;
        }

        if (el.classList.contains('cm-link')) {
          const potentialUrlElement = getNextNSibling(el, 3);
          el = potentialUrlElement?.classList.contains('cm-url') ? potentialUrlElement : el;
        }

        const link = el.textContent;
        const isMdFile = /^[0-9a-f]{8}\.md$/i.test(link);
        const hasProtocol = /^[a-zA-Z]+:\/\//.test(link);
        (isMdFile) ? this.$emit('note-open', link) : window.open(hasProtocol ? link : 'https://' + link, '_blank');
        e.preventDefault();
      }
    });

    this.handleEditorVimMode();
    this.handleEditorFoldGutter();
    document.addEventListener('keydown', this.handleKeyPress);
  },
  beforeDestroy() {
    document.removeEventListener('keydown', this.handleKeyPress);
  },
  watch: {
    'activeTabId': function(newVal) { if (this.$notesiumState.editorVimMode && this.note.Filename == newVal) this.$nextTick(() => { this.cm.focus(); }); },
    'note.Linenum': function(newVal) { this.lineNumberHL(newVal); if (this.$notesiumState.editorVimMode) this.$nextTick(() => { this.cm.focus(); }); },
    'note.Mtime': function() { this.cm.doc.markClean(); },
    '$notesiumState.editorLineWrapping': function(newVal) { this.cm.setOption("lineWrapping", newVal); },
    '$notesiumState.editorVimMode': function() { this.handleEditorVimMode(); },
    '$notesiumState.editorFoldGutter': function() { this.handleEditorFoldGutter(); },
  },
  template: t
}
