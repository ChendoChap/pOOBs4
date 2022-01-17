BITS 64
DEFAULT REL

; Kill sysveri, kill its family, kill its friends, kill it all!
; asm by me.

;(void* kernelbase)
userland:
    mov eax, 0xB
	mov rsi, rdi
	lea rdi, [kernel]
	syscall
	ret
	
; (struct thread*, void* uap)
; *(uap + 0x8) == kernelbase
kernel:
    push rbp
	mov rbp, rsp
	
	mov rdi, qword [rsi + 0x8]
	;call get_kernel_base
	;mov rdi, rax
	call init_globals
	call write_swd_patch
	
_swd_loop:
    call [ksched_yield]
	mov rdi, qword [swd_flag]
	mov rdi, [rdi]
	test rdi, rdi
	jz _swd_loop
	
	lea rdi, [event1]
	mov rsi, qword [ktdsuspend_global_eventhandler_iterator_func]
	mov rdx, qword [swd_thread]
	mov rdx, qword [rdx]
	call remove_suspend_resume_event
	
	lea rdi, [event2]
	mov rsi, qword [ktdresume_global_eventhandler_iterator_func]
	mov rdx, qword [swd_thread]
	mov rdx, qword [rdx]
	call remove_suspend_resume_event
	
	lea rdi, [event1]
	mov rsi, qword [ktdsuspend_global_eventhandler_iterator_func]
	mov rdx, qword [SceSblSysVeriThrGlobal]
	mov rdx, qword [rdx]
	call remove_suspend_resume_event
	
	lea rdi, [event3]
	mov rsi, qword [ktdresume_global_eventhandler_iterator_func]
	mov rdx, qword [SceSblSysVeriThrGlobal]
	mov rdx, qword [rdx]
	call remove_suspend_resume_event
	
	call write_veri_patch
	
	pop rbp
	ret
	
; (void* kernelbase)
init_globals:
    mov qword [kernelbase], rdi
	add qword [eventhandler_find_list], rdi
	add qword [_mtx_unlock_flags], rdi
	add qword [ktdsuspend_global_eventhandler_iterator_func], rdi
	add qword [ktdresume_global_eventhandler_iterator_func], rdi
	add qword [SceSblSysVeriThrGlobal], rdi
	add qword [swd_patch_1], rdi
	add qword [swd_patch_2], rdi
	add qword [kthread_exit], rdi
	add qword [ksched_yield], rdi
	add qword [veri_pfs_patch], rdi
	add qword [veri_sbl_patch], rdi
	add qword [veri_loadable_patch], rdi
	add qword [veri_init_patch], rdi
	add qword [veri_shutdown], rdi
	add qword [swd_thread], rdi
	add qword [swd_flag], rdi
    ret
	
; (const char* name, void* handler, void* thread)
remove_suspend_resume_event:
    push rbp
	mov rbp, rsp
	sub rsp, 0x10
	mov qword [rsp + 0x0], rsi
	mov qword [rsp + 0x8], rdx
	
	call [eventhandler_find_list]
	test rax, rax
	jz _remove_suspend_resume_event_end
	mov rdx, rax
    mov rax, qword [rax + 0x40]
    test rax, rax
	jz _remove_suspend_resume_event_cleanup
	
_remove_suspend_resume_event_loop_start:
    mov rdi, qword [rax + 0x28]
    cmp rdi, qword [rsp]
	jz _remove_suspend_resume_event_loop_check

_remove_suspend_resume_event_loop_next:
    mov rax, qword [rax]
    test rax, rax
    jz _remove_suspend_resume_event_cleanup
    jmp _remove_suspend_resume_event_loop_start

_remove_suspend_resume_event_loop_check:
    mov rdi, qword [rax + 0x18]
    test rdi, rdi
    jz _remove_suspend_resume_event_loop_next
    mov rdi, qword [rdi + 0x10]
    cmp rdi, qword [rsp + 0x8]
    jnz _remove_suspend_resume_event_loop_next

_remove_suspend_resume_event_loop_found:
    mov dword [rax + 0x10], 0xFFFFFFFF

_remove_suspend_resume_event_cleanup:
    lea rdi, [rdx + 0x10]
    xor esi, esi
    xor edx, edx
    xor ecx, ecx
	call [_mtx_unlock_flags]

_remove_suspend_resume_event_end:
	add rsp, 0x10
	pop rbp
	ret


; patch1
;  nop
;  nop
;  nop
;  nop
;  nop
;  nop
;  movabs rax, swd_thread
;  mov rdi, qword ptr gs:[0x0]
;  mov qword ptr [rax], rdi
;  nop
;  nop
;  movabs rax, swd_flag
;  mov qword ptr [rax], 0x1
;  jmp kthread_exit

; patch2
; jmp patch1

; (void)
write_swd_patch:
    push rbp
	mov rbp, rsp
	mov rax, cr0
	and rax, 0xFFFFFFFFFFFEFFFF
	mov cr0, rax
	
	mov rdi, qword [swd_patch_1]
	mov dword [rdi], 0x90909090
	mov dword [rdi + 0x4], 0xB8489090
	mov rsi, qword [swd_thread]
	mov qword [rdi + 0x8], rsi
	mov dword [rdi + 0x10], 0x3C8B4865
	mov dword [rdi + 0x14], 0x00000025
	mov dword [rdi + 0x18], 0x38894800
	mov dword [rdi + 0x1C], 0xB8489090
	mov rsi, qword [swd_flag]
	mov qword [rdi + 0x20], rsi
	mov dword [rdi + 0x28], 0x0100C748
	mov dword [rdi + 0x2C], 0xE9000000
	
	lea rsi, [rdi + 0x34]
	mov rdx, qword [kthread_exit]
	sub rdx, rsi
	mov dword [rdi + 0x30], edx
	
	mov rsi, qword [swd_patch_2]
	lea rdx, [rsi + 0x5]
	sub rdi, rdx
	mov edi, edi
	shl rdi, 0x8
	or rdi, 0xE9
	mov qword [rsi], rdi
	
    or rax, 0x10000
	mov cr0, rax
	pop rbp
	ret

; (void)
write_veri_patch:
    push rbp
	mov rbp, rsp
	mov rax, cr0
	and rax, 0xFFFFFFFFFFFEFFFF
	mov cr0, rax
	
	mov rdi, qword [veri_pfs_patch]
	mov dword [rdi], 0x00C3C031;
	mov rdi, qword [veri_sbl_patch]
	mov dword [rdi], 0x00C3C031;
	mov rdi, qword [veri_loadable_patch]
	mov dword [rdi], 0x00C3C031;
	mov rdi, qword [veri_init_patch]
	mov dword [rdi], 0x00C3C031;
	
	mov rdi, qword [kernelbase]
	mov dword [rdi + 0x1F1E01], 0x9090F631
	mov dword [rdi + 0x1F1E05], 0x9090C931
	mov dword [rdi + 0x1F1E09], 0x9090D231
	mov dword [rdi + 0x1F1E3E], 0x9090C931
	
    or rax, 0x10000
	mov cr0, rax
	
	call [veri_shutdown]
	
	mov rax, cr0
	and rax, 0xFFFFFFFFFFFEFFFF
	mov cr0, rax
	
	mov rdi, qword [veri_shutdown]
	mov dword [rdi], 0x00C3C031;
	
	or rax, 0x10000
	mov cr0, rax
	
	pop rbp
	ret

;get_kernel_base:
;    mov ecx, 0xC0000082
;    rdmsr
;	shl	rdx, 0x20
;	or rax, rdx
;	sub rax, 0x1C0
;	ret
;	
;infloop:
;    jmp infloop

; DATA
event1: db 'system_suspend_phase2_pre_sync', 0
event2: db 'system_resume_phase2', 0
event3: db 'system_resume_phase3', 0

align 8

kernelbase: dq 0
eventhandler_find_list: dq 0xF88F0
_mtx_unlock_flags: dq 0x2EF170
ktdsuspend_global_eventhandler_iterator_func: dq 0x18DF0
ktdresume_global_eventhandler_iterator_func: dq 0x18EF0
SceSblSysVeriThrGlobal: dq 0x2654110
kthread_exit: dq 0x97230
ksched_yield: dq 0x402E60

swd_flag: dq 0x1520108
swd_thread: dq 0x1520100

swd_patch_1: dq 0x462D20
swd_patch_2: dq 0x462DFC

veri_pfs_patch: dq 0x6259a0
veri_sbl_patch: dq 0x6268d0
veri_loadable_patch: dq 0x625dc0
veri_init_patch: dq 0x626290
veri_shutdown: dq 0x626720

align 4