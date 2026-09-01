const fs = require("fs");
const path = require("path");
const Debug = require("./debug");

class WikiScraper {

    static refreshIntervalMs = 1000 * 60 * 60 * 24; // 24 hours

    static repoRoot = path.resolve(__dirname, "..");

    static getDataFilePath(filename) {
        return path.join(WikiScraper.repoRoot, filename);
    }

    static itemExceptions = [ //items that are bad in the scraped dataset will be overriden from this list
        [4308, "UT. Yellow Beehemoth Armor"],
        [4333, "UT. Yellow Beehemoth Quiver"],
        [4310, "UT. Blue Beehemoth Armor"],
        [4338, "UT. Blue Beehemoth Quiver"],
        [4309, "UT. Red Beehemoth Armor"],
        [4339, "UT. Red Beehemoth Quiver"],
        [17565, "UT. Green Beehemoth Armor"],
        [17564, "UT. Green Beehemoth Quiver"],
        [26748, "Morning Star of Sweet Miracles"],
        [57113, "Blooming Bouquet"],
        [25686, "ST. Alien Core: Power"], //the dataset falsely claims cores drop in white bags, no relevance but curious mistake
        [25701, "ST. Alien Core: Warp"],
        [25702, "ST. Alien Core: Corrosion"],
        [25703, "ST. Alien Core: Dark Matter"],
        [56467, "ST. Neo Alien Core: Power"],
        [56468, "ST. Neo Alien Core: Warp"],
        [56469, "ST. Neo Alien Core: Corrosion"],
        [56470, "ST. Neo Alien Core: Dark Matter"],
        
        [5343, "UT. Yellow Beehemoth Quiver"], //shinies start here
        [5344, "UT. Red Beehemoth Quiver"], 
        [5345, "UT. Blue Beehemoth Quiver"], 
        [5346, "UT. Green Beehemoth Quiver"]
    ]

    static superItemExceptions = [ //Extra exceptional items that will be inserted directly into wikiItems
        [65531, "shiny_Kendo_Stick"],
        [32667, "Red_Nosed"], 
        [30365, "Red_Nosed"], //duplicate entry because of mapping ambiguity
        [40999, "Red_Nisse"], 
        [41002, "Green_Nisse"], 
        [41005, "Blue_Nisse"], 
        [7430, "Pet_Cube"],
        [10923, "Bes__Pet_Skin"],
        [2224, "Killer_Bee_Pet_Skin"]
    ]

    wikiItems = {} //does not fully exclude untracked items, as some sneak in during scraping
    
    loadItems() {
        this.wikiItems = JSON.parse(fs.readFileSync(WikiScraper.getDataFilePath("game_items.json"), "utf8"));
    }

    shouldRefreshWikiItems() {
        const refreshFile = WikiScraper.getDataFilePath("game_items_last_refresh.json");
        const refreshInfo = fs.existsSync(refreshFile)
            ? JSON.parse(fs.readFileSync(refreshFile, "utf8"))
            : {};
        const lastRefresh = Number(refreshInfo.timestamp || 0);
        return !lastRefresh || (Date.now() - lastRefresh) > WikiScraper.refreshIntervalMs;
    }

    markWikiRefresh() {
        fs.writeFileSync(WikiScraper.getDataFilePath("game_items_last_refresh.json"), JSON.stringify({ timestamp: Date.now() }, null, 2));
    }

    saveItems() {
        const previousItemsPath = WikiScraper.getDataFilePath("game_items.json");
        const previousItems = fs.existsSync(previousItemsPath)
            ? JSON.parse(fs.readFileSync(previousItemsPath, "utf8"))
            : {};

        const newItems = {};
        for (const [id, name] of Object.entries(this.wikiItems)) {
            if (!Object.prototype.hasOwnProperty.call(previousItems, id)) {
                newItems[id] = name;
            }
        }

        fs.writeFileSync(previousItemsPath, JSON.stringify(this.wikiItems, null, 2));
        this.markWikiRefresh();

        const diffLines = Object.entries(newItems)
            .map(([id, name]) => `${id}: ${name}`);

        const diffFilePath = WikiScraper.getDataFilePath("game_items_new_items.txt");
        fs.writeFileSync(
            diffFilePath,
            diffLines.length > 0 ? `${diffLines.join("\n")}\n` : "No new items found.\n"
        );
    }

    //compares scraped data against what's on disc, intended to catch silently added items like Minotaur Mace
    newItemsSinceLastUpdate() {
        Debug.startupLog("feature not implemented");
    }

    errorCorrectSkins(unrecognizedItems) {
        for (const item of unrecognizedItems) {
            if (!item.endsWith("Skin"))
                continue;
            const splitItem = item.split("_");
            splitItem.splice(splitItem.length-2, 1);
            const searchTerm = splitItem.join("_");
            for (const [id, name] of Object.entries(this.wikiItems)) {
                if (name.startsWith(searchTerm)) {
                    this.wikiItems[id] = item;
                    Debug.startupLog(`Replaced ${searchTerm} with ${item}`);
                }
            }
        }
    }

    async setWikiItems() {
        let wikiItems = {};
        
        const scrapedItems = await this.scrape();
        for (const item of scrapedItems) {
            this.updateItemList(item[0], item[1], item[2], wikiItems);
        }

        const e = WikiScraper.itemExceptions;
        for (let i=0; i<e.length; i++) {
            this.updateItemList(e[i][0], e[i][1], e.length-i <= 4, wikiItems);
        }

        for (const item of WikiScraper.superItemExceptions) {
            wikiItems[item[0]] = item[1];
        }

        this.wikiItems = wikiItems;
    }

    async fetchPage(url) {
        const response = await fetch(url);
        if (!response.ok) { throw new Error(`HTTP ${response.status}: ${response.statusText}`); }
        return await response.text();
    }   

    async scrape() {
        const whites = await this.fetchPage("https://realm.wiki/object?id=1292"); //white bag drops
        const teals = await this.fetchPage("https://realm.wiki/object?id=1289"); //teal bag drops
        const oranges = await this.fetchPage("https://realm.wiki/object?id=1295"); //ST bag drops
        const yellows = await this.fetchPage("https://realm.wiki/object?id=1294"); //yellow bag drops
        const reds = await this.fetchPage("https://realm.wiki/object?id=1708"); //red bag drops
        const shinies = await this.fetchPage("https://realm.wiki/list/ItemLabel?label=SHINY"); //shiny items list - shiny items are added last since they need to override the already added shinies with a particular string format
        const docs = [whites, teals, oranges, yellows, reds, shinies];
        let scrapedItems = [];
        
        for (let i=0; i<6; i++) {
            let pos = 0;
            const html = docs[i]
            while (true) {
                const start = html.indexOf("<div class='item-preview'>", pos);
                if (start === -1) break;
    
                // href="/object?id=..."
                const idStart = html.indexOf("/item?id=", start) + "/item?id=".length;
                const idEnd = html.indexOf("'>", idStart);
                const id = html.substring(idStart, idEnd);
    
                // card-header containing the name
                const nameStart = html.indexOf("<div class='card-header'>", idEnd) + "<div class='card-header'>".length;
                const nameEnd = html.indexOf("</div>", nameStart);
                const name = html.substring(nameStart, nameEnd).trim();
    
                if (!this.isTieredItem(name))
                    scrapedItems.push([id, name, i==5]);
                pos = nameEnd;
            }
        }

        return scrapedItems;
    }

    //conforms item names to rotmg-builds.com expected format
    formatString(itemName, isShiny) {
        if (/^(ST|UT)\. /.test(itemName)) {
            itemName = itemName.slice(4);
        }
        if (itemName.endsWith(" Shiny")) { //a few shinies in the dataset includes it in their name
            itemName = itemName.slice(0, -6);
        }
        itemName = itemName.replace(/[ .:'-]/g,"_");
        if (isShiny) {
            itemName = 'shiny_' + itemName + '__Shiny_';
        }
        return itemName;
    }

    isTieredItem(itemName) {
        return !isNaN(itemName[1]);
    }

    updateItemList(id, name, isShiny, list) {
        list[id] = this.formatString(name, isShiny);
    }

    //used during development to sanity check data
    checkItemListOverlap(...files) {
        const keyMap = new Map();

        for (const file of files) {
            const obj = JSON.parse(fs.readFileSync(file, "utf8"));

            for (const key of Object.keys(obj)) {
                if (!keyMap.has(key)) {
                    keyMap.set(key, []);
                }
                keyMap.get(key).push(file);
            }
        }

        const overlaps = [...keyMap.entries()]
            .filter(([_, fileList]) => fileList.length > 1);

        Debug.dev(`Found ${overlaps.length} overlapping keys:`);

        for (const [key, fileList] of overlaps) {
            Debug.dev(`${key}: ${fileList.join(", ")}`);
        }
    }
}

module.exports = WikiScraper;