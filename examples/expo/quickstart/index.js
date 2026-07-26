import { registerRootComponent } from "expo";

import App from "./App";

// registerRootComponent calls AppRegistry.registerComponent('main', () => App)
// It also ensures the environment is set up appropriately whether running in
// Expo Go or in a native build, on Android, iOS, or web.
registerRootComponent(App);
