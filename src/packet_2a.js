const BufferReader = require("./bufferReader");
const Util = require("./Util");

//Server update packet
class Packet_2A {
    
    playerX
    playerY
    mysteryByte
    tileData = []
    objectData = []
    outOfViewData = []

    static stringTypes = [31,38,54,62,71,72,80,82,115,121,127,128,147,155]
    static lootBags = [
        1289,1725, //teal bags
        1294,1724, //yellow bags
        1295,1727, //ST bags
        1292,1296, //white bags
        1291,1726, //blue bags - could override teal bags containing UTs
        1708,1728 //red bags - contains a few seasonal drops
    ]

    constructor(buffer) {
        const br = new BufferReader(buffer);
        this.playerX = br.readFloat();
        this.playerY = br.readFloat();
        this.mysteryByte = br.readByte();

        const tileDataLength = br.readCompressedInt();
        for (let i=0; i<tileDataLength; i++) {
            this.tileData.push({
                x: br.readShort(),
                y: br.readShort(),
                type: br.readUShort()
            })
        }

        const objectDataLength = br.readCompressedInt();
        for (let i=0; i<objectDataLength; i++) {
            const objectType = br.readUShort();
            const objectId = br.readCompressedInt();
            const x = br.readFloat();    
            const y = br.readFloat();
            const stats = []
            const statLength = br.readCompressedInt();
            for (let j=0; j<statLength; j++) {
                const statType = br.readByte()
                stats.push({
                    statType,
                    value1: Packet_2A.stringTypes.includes(statType) ? br.readString() : br.readCompressedInt(),
                    value2: br.readCompressedInt()
                })
            }
            this.objectData.push({objectType, objectId, x, y, stats})
        }

        const outOfViewDataLength = br.readCompressedInt();
        for (let i=0; i<outOfViewDataLength; i++) {
            this.outOfViewData.push(br.readCompressedInt())
        }
    }

    hasLoot() {
        return this.objectData.some(obj => Packet_2A.lootBags.includes(obj.objectType));
    }

    getLootBagContentsById(objectId) {
        var loot = [];
        var lootbag = this.objectData.find(e => e.objectId === objectId) 
        const enchantmentsArray = lootbag.stats.find((e) => e["statType"] === 80)["value1"].split(",");
        for (const stat of lootbag.stats) {
            if (stat["statType"] >= 8 &&
                    stat["statType"] <= 15 &&
                    stat["value1"] != -1) {
                loot.push([stat["value1"], enchantmentsArray[stat["statType"]-8]])
            }
        }
        return loot;
    }

    getLootBagIds() {
        let ids = []
        for (const obj of this.objectData) {
            if (!Packet_2A.lootBags.includes(obj.objectType))
                continue;
            ids.push(obj.objectId);
        }
        return ids;
    }
}

module.exports = Packet_2A;