const fs = require("fs");

class WikiScraper {

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

    static superItemExceptions = [ //Extra exceptional items that will be inserted directly into completionTrackedItems
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

    completionTrackedItems = {} //does not fully exclude untracked items, as some sneak in during scraping
    
    loadItems() {
        this.completionTrackedItems = JSON.parse(fs.readFileSync("game_items.json", "utf8"));
    }

    saveItems() {
        fs.writeFileSync("game_items.json", JSON.stringify(this.completionTrackedItems, null, 2));
    }

    //compares scraped data against what's on disc, intended to catch silently added items like Minotaur Mace
    newItemsSinceLastUpdate() {
        console.log("feature not implemented");
    }

    errorCorrectSkins(unrecognizedItems) {
        for (const item of unrecognizedItems) {
            if (!item.endsWith("Skin"))
                continue;
            const splitItem = item.split("_");
            splitItem.splice(splitItem.length-2, 1);
            const searchTerm = splitItem.join("_");
            for (const [id, name] of Object.entries(this.completionTrackedItems)) {
                if (name.startsWith(searchTerm)) {
                    this.completionTrackedItems[id] = item;
                    console.log(`Replaced ${searchTerm} with ${item}`);
                }
            }
        }
    }

    async setCompletionTrackedItems() {
        let completionTrackedItems = {};
        
        const scrapedItems = await this.scrape();
        for (const item of scrapedItems) {
            this.updateItemList(item[0], item[1], item[2], completionTrackedItems);
        }

        const e = WikiScraper.itemExceptions;
        for (let i=0; i<e.length; i++) {
            this.updateItemList(e[i][0], e[i][1], e.length-i <= 4, completionTrackedItems);
        }

        for (const item of WikiScraper.superItemExceptions) {
            completionTrackedItems[item[0]] = item[1];
        }

        this.completionTrackedItems = completionTrackedItems;
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

        console.log(`Found ${overlaps.length} overlapping keys:`);

        for (const [key, fileList] of overlaps) {
            console.log(`${key}: ${fileList.join(", ")}`);
        }
    }
}

module.exports = WikiScraper;