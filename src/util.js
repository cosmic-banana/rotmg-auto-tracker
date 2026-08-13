class Util {

    static classes = [
        782, //wizard
        784, //priest
        785, //samurai
        797, //warrior
        804, //trickster
        817, //summoner
        805, //sorcerer
        768, //rogue
        799, //paladin
        806, //ninja
        801, //necromancer
        803, //mystic
        798, //knight
        818, //kensei
        802, //huntress
        819, //druid
        796, //bard
        800, //assassin
        775, //archer
    ]
    
    static getItemRarity(base64) {
        return this.getItemEnchantIds(base64).length
    }

    static getItemEnchantIds(base64) {
        if (!base64)
            return [];
        let buffer = Buffer.from(base64, "base64");
        let enchantIds = []
        let offset = 3;
        for (let i=0; i<4; i++) {
            let enchant = buffer.readUInt16LE(offset);
            if (enchant !== 0xFFFD) enchantIds.push(enchant)
            offset+=2;
        }
        return enchantIds;
    }

}

module.exports = Util;