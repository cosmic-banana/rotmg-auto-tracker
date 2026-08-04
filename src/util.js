class Util {

    static getItemRarity(base64) {
        return this.getItemEnchantIds(base64).length
    }

    static getItemEnchantIds(base64) {
        if (!base64)
            return [];
        let br = Buffer.from(base64, "base64");
        let enchantIds = []
        let offset = 3;
        for (let i=0; i<4; i++) {
            let enchant = br.readUInt16LE(offset);
            if (enchant !== 0xFFFD) enchantIds.push(enchant)
            offset+=2;
        }
        return enchantIds;
    }

}

module.exports = Util;