const makeExt = require('../adapter');

// The Controller panel extension (boundary B blocks, the widget face).
//
// Source identical in surface to scratch-gui's lib/bw-board/controller-extension.js
// (the gallery/self-register copy); this is the built-in wrapper the scratch-vm
// ExtensionManager loads by id 'controller'. The panel instance is resolved
// lazily from Scratch.vm.runtime.controllerPanel (written by the host tab in
// gui.jsx) exactly the way circuit reads vm.runtime.circuitBoard.
//
// Reporters read the placed widgets (joystick axes, slider/dial value, button
// state); the setWidget command drives a widget from the program, closing the
// loop the other way. The NAME dropdown is filled from the panel's live widget
// list. No template literals / backticks below: the whole source is a makeExt
// template string, so a backtick would terminate it early.
module.exports = makeExt(`// Name: Controller
// ID: controller
// Description: Read and drive the Controller panel widgets from your blocks.
// By: CrispStrobe <https://github.com/CrispStrobe>
// License: MPL-2.0
(function (Scratch) {
  "use strict";

  // ============================================================================
  // INTERNATIONALIZATION
  // ============================================================================

  const translations = {
    en: {
      "ctrl.name":      "Controller",
      "ctrl.value":     "value of [NAME]",
      "ctrl.x":         "[NAME] x",
      "ctrl.y":         "[NAME] y",
      "ctrl.pressed":   "[NAME] pressed?",
      "ctrl.setWidget": "set [NAME] to [VALUE]",
      "ctrl.noPanel":   "(no panel)",
    },
    de: {
      "ctrl.name":      "Controller",
      "ctrl.value":     "Wert von [NAME]",
      "ctrl.x":         "[NAME] x",
      "ctrl.y":         "[NAME] y",
      "ctrl.pressed":   "[NAME] gedrückt?",
      "ctrl.setWidget": "setze [NAME] auf [VALUE]",
      "ctrl.noPanel":   "(kein Panel)",
    },
    fr: {
      "ctrl.name":      "Contrôleur",
      "ctrl.value":     "valeur de [NAME]",
      "ctrl.x":         "[NAME] x",
      "ctrl.y":         "[NAME] y",
      "ctrl.pressed":   "[NAME] appuyé ?",
      "ctrl.setWidget": "mettre [NAME] à [VALUE]",
      "ctrl.noPanel":   "(pas de panneau)",
    },
  };

  // ============================================================================
  // LANGUAGE DETECTION (same pattern as circuit)
  // ============================================================================

  function detectLanguage() {
    const candidates = [];
    try {
      if (typeof window !== "undefined" && window.ReduxStore && window.ReduxStore.getState) {
        const st = window.ReduxStore.getState();
        candidates.push(st && st.locales && st.locales.locale);
      }
    } catch (e) { /* ignore */ }
    try { candidates.push(localStorage.getItem("tw:language")); } catch (e) { /* ignore */ }
    try {
      if (typeof Scratch !== "undefined" && Scratch.vm && Scratch.vm.runtime && Scratch.vm.runtime.getLocale) {
        candidates.push(Scratch.vm.runtime.getLocale());
      }
    } catch (e) { /* ignore */ }
    try { candidates.push(document.documentElement.lang); } catch (e) { /* ignore */ }
    try { candidates.push(navigator.language); } catch (e) { /* ignore */ }
    for (const c of candidates) {
      if (typeof c !== "string" || !c) continue;
      const lower = c.toLowerCase();
      if (lower.indexOf("de") === 0) return "de";
      if (lower.indexOf("fr") === 0) return "fr";
      if (lower.indexOf("en") === 0) return "en";
    }
    return "en";
  }

  let currentLang = detectLanguage();

  if (typeof window !== "undefined") {
    window.addEventListener("storage", function (e) {
      if (e.key === "tw:language") currentLang = detectLanguage();
    });
  }

  function t(key) {
    const table = translations[currentLang] || translations.en;
    if (table[key] != null) return table[key];
    if (translations.en[key] != null) return translations.en[key];
    return key;
  }

  // ============================================================================
  // EXTENSION
  // ============================================================================

  class ControllerExtension {
    constructor() {
      this._panel = null;
      this._runtime =
        typeof Scratch !== "undefined" && Scratch.vm && Scratch.vm.runtime
          ? Scratch.vm.runtime
          : null;
    }

    // ---- panel resolution -------------------------------------------------
    // Lazy: prefer an explicitly attached panel, else the one the host tab
    // publishes on vm.runtime.controllerPanel.
    get panel() {
      return this._panel || (this._runtime && this._runtime.controllerPanel) || null;
    }

    setPanel(panel) { this._panel = panel; }
    clearPanel() { this._panel = null; }

    getInfo() {
      return {
        id: "controller",
        name: t("ctrl.name"),
        color1: "#7C3AED",
        color2: "#6D28D9",
        color3: "#5B21B6",
        blocks: [
          {
            opcode: "controllerValue",
            blockType: Scratch.BlockType.REPORTER,
            text: t("ctrl.value"),
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, menu: "WIDGETS", defaultValue: "" },
            },
          },
          {
            opcode: "controllerX",
            blockType: Scratch.BlockType.REPORTER,
            text: t("ctrl.x"),
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, menu: "WIDGETS", defaultValue: "" },
            },
          },
          {
            opcode: "controllerY",
            blockType: Scratch.BlockType.REPORTER,
            text: t("ctrl.y"),
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, menu: "WIDGETS", defaultValue: "" },
            },
          },
          {
            opcode: "controllerPressed",
            blockType: Scratch.BlockType.BOOLEAN,
            text: t("ctrl.pressed"),
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, menu: "WIDGETS", defaultValue: "" },
            },
          },
          "---",
          {
            opcode: "setWidget",
            blockType: Scratch.BlockType.COMMAND,
            text: t("ctrl.setWidget"),
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, menu: "WIDGETS", defaultValue: "" },
              VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
            },
          },
        ],
        menus: {
          WIDGETS: {
            acceptReporters: true,
            items: "_getWidgetMenu",
          },
        },
      };
    }

    // ---- dynamic menu -----------------------------------------------------

    _getWidgetMenu() {
      const p = this.panel;
      if (!p) return [{ text: t("ctrl.noPanel"), value: "" }];
      const names = p.getWidgetNames();
      if (!names || names.length === 0) return [{ text: t("ctrl.noPanel"), value: "" }];
      return names.map(function (n) { return { text: n, value: n }; });
    }

    // ---- reporters --------------------------------------------------------

    controllerValue(args) {
      const p = this.panel;
      return p ? p.getValue(String(args.NAME)) : 0;
    }

    controllerX(args) {
      const p = this.panel;
      return p ? p.getX(String(args.NAME)) : 0;
    }

    controllerY(args) {
      const p = this.panel;
      return p ? p.getY(String(args.NAME)) : 0;
    }

    controllerPressed(args) {
      const p = this.panel;
      return p ? p.isPressed(String(args.NAME)) : false;
    }

    // ---- commands ---------------------------------------------------------

    setWidget(args) {
      const p = this.panel;
      if (!p) return;
      const name = String(args.NAME);
      const w = p.getWidget(name);
      if (!w) return;
      const val = Number(args.VALUE);
      if (w.type === "slider" || w.type === "dial") {
        p.setSliderInput(name, val);
      } else if (w.type === "gauge") {
        p.setGaugeValue(name, val);
      } else if (w.type === "button") {
        p.setButtonInput(name, !!val);
      } else if (w.type === "joystick") {
        // setWidget on a joystick sets X; use the "y" reporter for the Y axis.
        p.setJoystickInput(name, val, p.getY(name));
      } else if (w.type === "dpad") {
        // setWidget on a dpad: bitmask (up=1, down=2, left=4, right=8).
        const v = Math.round(val);
        p.setDpadInput(name, "up",    !!(v & 1));
        p.setDpadInput(name, "down",  !!(v & 2));
        p.setDpadInput(name, "left",  !!(v & 4));
        p.setDpadInput(name, "right", !!(v & 8));
      }
    }
  }

  Scratch.extensions.register(new ControllerExtension());
})(Scratch);
`);
