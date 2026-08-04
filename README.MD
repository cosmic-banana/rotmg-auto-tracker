### What is it?
This project is built strictly to interface with www.rotmg-builds.com. It automatically logs UTs and STs dropped while playing RotMG.

### How does it work?
Keep it running on the machine that also runs RotMG.exe and it will listen to the network traffic and automatically update your collection log. This application does not interfere in ANY way with the game - no proxying, injections or modifications.

### Prerequisites
It runs on Windows and requires Wireshark installed in the default installation path.

### Upcoming features
- Ability to open app while in-game and track items without loading into a new map.
- Automatic tracking of dungeon completes count.
- (Possibly) Track damage dealt for own character only.
- (Possibly) Easy-access display for daily quests
- (Possibly) System notification for subscription-based events, such as biome white bags or specific dungeon modifiers.

### Notes
- For v1, launch this app before launching RotMG, otherwise the app may crash.
- For v1, this is not yet a compilable app. It's launched and runs in the console with sparse dev logging. It will require Nodejs and possibly other build env tools.
- It has no GUI or user-friendliness. It will require sparse hard-coding for things rotmg-builds.com credentials, collection log and item loading.
- App is largely untested. Any reports of crashing or unexpected behaviour will be appreciated.