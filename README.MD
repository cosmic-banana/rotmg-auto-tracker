### What is it?
This project is built strictly to interface with www.rotmg-builds.com. It automatically logs items dropped while playing RotMG.

### How does it work?
Keep it running on the machine that also runs RotMG.exe and it will listen to the network traffic and automatically update your collection log. This application does not interfere in ANY way with the game - no proxying, injections or modifications. Per [DECA's recent blogpost](https://hub.realmofthemadgod.com/news0/news1/guardians), they have directly identified this type of sniffer as legal under their TOS.

### Prerequisites
It runs on Windows and requires Wireshark installed in the default installation path.

### Setup
1. Download [Wireshark](https://www.wireshark.org/)
- IMPORTANT: Make sure to install NpCap and tshark as part of the installation process. If you do not, this application will not work.
2. Launch application and log in with [rotmg-builds.com](https://rotmg-builds.com/pages/login.html) credentials. If required, make a new account/collection on the site.
3. Select a collection, then press the Start button to start monitoring network traffic.
4. Launch RotMG, and play the game! Any loggable items that get dropped by enemies will be logged. Output can be seen in the App window.

### Upcoming features/future updates
- Ability to open app while in-game and track items without loading into a new map.
- Automatic tracking of dungeon completes count.
- Track damage dealt.
- System notification for subscription-based events, such as biome white bags or specific dungeon modifiers.
- Mac OS/Ubuntu support?

### Notes
- For v1, launch this app before launching RotMG, otherwise the app may crash.
- This app is new, and as a result may have bugs! Any reports of crashing or unexpected behaviour will be appreciated.