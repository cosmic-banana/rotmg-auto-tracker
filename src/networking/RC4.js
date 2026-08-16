class RC4 {
    static KEYS = ['c91d9eec420160730d825604e0', '5a4d2016bc16dc64883194ffd9']

    constructor(arg) {
        const key = Buffer.from(RC4.KEYS[arg], 'hex');
        this.S = Array.from({ length: 256 }, (_, i) => i);

        let j = 0;
        for (let i = 0; i < 256; i++) {
            j = (j + this.S[i] + key[i % key.length]) & 255;

            [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
        }

        this.i = 0;
        this.j = 0;
    }

    decrypt(data) {
        const out = Buffer.alloc(data.length);

        for (let n = 0; n < data.length; n++) {
            this.i = (this.i + 1) & 255;
            this.j = (this.j + this.S[this.i]) & 255;

            [this.S[this.i], this.S[this.j]] =
            [this.S[this.j], this.S[this.i]];

            const k = this.S[
            (this.S[this.i] + this.S[this.j]) & 255
            ];

            out[n] = data[n] ^ k;
        }

        return out;
    }
}

module.exports = RC4;