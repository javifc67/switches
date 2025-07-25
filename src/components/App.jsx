import { useContext, useEffect, useRef, useState } from "react";
import "./../assets/scss/app.scss";
import "./../assets/scss/modal.scss";

import {
  COLORS,
  DEFAULT_APP_SETTINGS,
  ESCAPP_CLIENT_SETTINGS,
  ICONS,
  SWITCHTYPE,
  THEME_ASSETS,
} from "../constants/constants.jsx";
import { GlobalContext } from "./GlobalContext.jsx";
import MainScreen from "./MainScreen.jsx";

export default function App() {
  const { escapp, setEscapp, appSettings, setAppSettings, Storage, setStorage, Utils, I18n } =
    useContext(GlobalContext);
  const hasExecutedEscappValidation = useRef(false);

  const [loading, setLoading] = useState(true);
  const [fail, setFail] = useState(false);
  const [solved, setSolved] = useState(false);
  const [solvedTrigger, setSolvedTrigger] = useState(0);
  const [loadedSolution, setLoadedSolution] = useState(null);

  useEffect(() => {
    //Init Escapp client
    if (escapp !== null) {
      return;
    }
    //Create the Escapp client instance.
    let _escapp = new ESCAPP(ESCAPP_CLIENT_SETTINGS);
    setEscapp(_escapp);
    Utils.log("Escapp client initiated with settings:", _escapp.getSettings());

    //Use the storage feature provided by Escapp client.
    setStorage(_escapp.getStorage());

    //Get app settings provided by the Escapp server.
    let _appSettings = processAppSettings(_escapp.getAppSettings());
    setAppSettings(_appSettings);
  }, []);

  useEffect(() => {
    if (!hasExecutedEscappValidation.current && escapp !== null && appSettings !== null && Storage !== null) {
      hasExecutedEscappValidation.current = true;

      //Register callbacks in Escapp client and validate user.
      escapp.registerCallback("onNewErStateCallback", function (erState) {
        try {
          Utils.log("New escape room state received from ESCAPP", erState);
          restoreAppState(erState);
        } catch (e) {
          Utils.log("Error in onNewErStateCallback", e);
        }
      });

      escapp.registerCallback("onErRestartCallback", function (erState) {
        try {
          Utils.log("Escape Room has been restarted.", erState);
          if (typeof Storage !== "undefined") {
            Storage.removeSetting("state");
          }
        } catch (e) {
          Utils.log("Error in onErRestartCallback", e);
        }
      });

      //Validate user. To be valid, a user must be authenticated and a participant of the escape room.
      escapp.validate((success, erState) => {
        try {
          Utils.log("ESCAPP validation", success, erState);
          if (success) {
            restoreAppState(erState);
            setLoading(false);
          }
        } catch (e) {
          Utils.log("Error in validate callback", e);
        }
      });
    }
  }, [escapp, appSettings, Storage]);

  function restoreAppState(erState) {
    Utils.log("Restore application state based on escape room state:", erState);
    // Si el puzle está resuelto lo ponemos en posicion de resuelto
    if (escapp.getAllPuzzlesSolved()) {
      if (appSettings.actionWhenLoadingIfSolved) {
        if (escapp.getAllPuzzlesSolved()) {
          let solution = escapp.getLastSolution();
          if (typeof solution !== "undefined") {
            setLoadedSolution(solution);
          }
        }
      }
    }
  }

  function processAppSettings(_appSettings) {
    if (typeof _appSettings !== "object") {
      _appSettings = {};
    }

    let skinSettings = THEME_ASSETS[_appSettings.skin] || {};

    let DEFAULT_APP_SETTINGS_SKIN = Utils.deepMerge(DEFAULT_APP_SETTINGS, skinSettings);

    // Merge _appSettings with DEFAULT_APP_SETTINGS_SKIN to obtain final app settings
    _appSettings = Utils.deepMerge(DEFAULT_APP_SETTINGS_SKIN, _appSettings);

    //Init internacionalization module
    I18n.init(_appSettings);

    if (typeof _appSettings.message !== "string") {
      _appSettings.message = I18n.getTrans("i.message");
    }

    let switches = [];

    switch (_appSettings.switchType) {
      case SWITCHTYPE.NUMBERS:
        switches = (_, i) => ({ label: i + 1 });
        break;
      case SWITCHTYPE.COLORS:
        switches = (_, i) => ({ color: COLORS[i % COLORS.length] });
        break;
      case SWITCHTYPE.SHAPES:
        switches = (_, i) => ({ ico: ICONS[i % ICONS.length] || "" });
        break;
      case SWITCHTYPE.COLORED_SHAPES:
        switches = (_, i) => ({ ico: ICONS[i % ICONS.length] || "", colorIco: COLORS[i % COLORS.length] });
        break;
      case SWITCHTYPE.CUSTOM:
        switches = _appSettings.customSwitches;
        break;
      default:
        switches = (_, i) => ({ label: String.fromCharCode(65 + (i % 26)) });
    }
    if (_appSettings.switchType !== SWITCHTYPE.CUSTOM) {
      switches = Array.from({ length: _appSettings.nSwitches }, switches);
    }

    switches = switches.map((s) => {
      s.pressed = false;
      return s;
    });

    _appSettings.switches = switches;

    //Change HTTP protocol to HTTPs in URLs if necessary
    _appSettings = Utils.checkUrlProtocols(_appSettings);

    //Preload resources (if necessary)
    Utils.preloadImages([_appSettings.backgroundMessage]);
    //Utils.preloadAudios([_appSettings.soundBeep,_appSettings.soundNok,_appSettings.soundOk]); //Preload done through HTML audio tags
    //Utils.preloadVideos(["videos/some_video.mp4"]);
    Utils.log("App settings:", _appSettings);
    return _appSettings;
  }

  const solvePuzzle = (solution) => {
    const solutionStr = solution
      .map((s) => {
        if (s.pressed) return "on";
        else return "off";
      })
      .join(";");
    checkResult(solutionStr);
  };

  function checkResult(_solution) {
    escapp.checkNextPuzzle(_solution, {}, (success, erState) => {
      Utils.log("Check solution Escapp response", success, erState);
      setSolved(success);
      setSolvedTrigger((prev) => prev + 1);
      if (success) {
        try {
          setTimeout(() => {
            submitPuzzleSolution(_solution);
          }, 2000);
        } catch (e) {
          Utils.log("Error in checkNextPuzzle", e);
        }
      } else {
        setFail(true);
        setTimeout(() => {
          setFail(false);
        }, 1500);
      }
    });
  }
  function submitPuzzleSolution(_solution) {
    Utils.log("Submit puzzle solution", _solution);

    escapp.submitNextPuzzle(_solution, {}, (success, erState) => {
      Utils.log("Solution submitted to Escapp", _solution, success, erState);
    });
  }

  return (
    <div
      id="global_wrapper"
      className={`${
        appSettings !== null && typeof appSettings.skin === "string" ? appSettings.skin.toLowerCase() : ""
      }`}
    >
      <div className={`main-background ${fail ? "fail" : ""}`}>
        {!loading && (
          <MainScreen
            config={appSettings}
            solvePuzzle={solvePuzzle}
            solved={solved}
            solvedTrigger={solvedTrigger}
            loadedSolution={loadedSolution}
            setSolved={setSolved}
          />
        )}
      </div>
    </div>
  );
}
