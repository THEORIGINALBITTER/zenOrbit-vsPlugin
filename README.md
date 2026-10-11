# ZenOrbit for VS Code

Build a branded orbit navigation without leaving VS Code. ZenOrbit provides a compact visual studio in the Activity Bar: configure the navigation, inspect it live and export a self-contained starter package into the current workspace.

## What it does

- Edit the centre mark, accent colour, radius and menu labels in a live preview.
- Export accessible HTML and CSS without a build tool.
- Keep the current menu configuration as a portable `zenorbit.json` file.
- Choose the export location with the `zenorbit.exportDirectory` setting.

## Use it

1. Install **ZenOrbit** from the VS Code Marketplace.
2. Open the ZenOrbit icon in the Activity Bar.
3. Design the menu in **Orbit Studio**.
4. Select **Export to workspace**.

The extension writes these files to `<workspace>/zenorbit` by default:

```text
zenorbit/
├── orbit.html       # markup and open/close behaviour
├── orbit.css        # standalone runtime styles
└── zenorbit.json    # reusable editor configuration
```

Change the output directory in VS Code Settings:

```json
{
  "zenorbit.exportDirectory": "src/components/zenorbit"
}
```

## Local development

```bash
git clone https://github.com/THEORIGINALBITTER/zenOrbit-vsPlugin.git
cd zenOrbit-vsPlugin
npm install
```

Open the folder in VS Code and press `F5`. This launches an **Extension Development Host** with the local ZenOrbit extension enabled.

Useful commands:

```bash
npm run lint       # syntax check
npm run package    # create a .vsix installer
```

## Install a local VSIX

```bash
code --install-extension zenorbit-vscode-0.1.0.vsix
```

## Publishing

The Marketplace publisher is `denisbitter`. A new version must use a higher semantic version number. After authenticating with the VS Code Extension Manager, run:

```bash
npx vsce publish patch
```

For a manual upload, create a package with `npm run package` and upload the resulting `.vsix` on the [Visual Studio Marketplace publisher portal](https://marketplace.visualstudio.com/manage/publishers/).

## License

MIT © Denis Bitter
