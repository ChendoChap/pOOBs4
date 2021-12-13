# PS4 9.00 Kernel Exploit
---
## Summary
In this project you will find an implementation that tries to make use of a filesystem bug for the Playstation 4 on firmware 9.00.
The bug was found while diffing the 9.00 and 9.03 kernels. It will require a drive with a modified exfat filesystem. Successfully triggering it will allow you to run arbitrary code as kernel, to allow jailbreaking and kernel-level modifications to the system. will launch the usual payload launcher (on port 9020).

## Patches Included
The following patches are applied to the kernel:
1) Allow RWX (read-write-execute) memory mapping (mmap / mprotect)
2) Syscall instruction allowed anywhere
3) Dynamic Resolving (`sys_dynlib_dlsym`) allowed from any process
4) Custom system call #11 (`kexec()`) to execute arbitrary code in kernel mode
5) Allow unprivileged users to call `setuid(0)` successfully. Works as a status check, doubles as a privilege escalation.
6) (`sys_dynlib_load_prx`) patch
7) Disable delayed panics from sysVeri

## Short how-to
This exploit is unlike previous ones where they were based purely in software. Triggering the vulnerability requires plugging in a specially formatted USB device at just the right time. In the repository you'll find a .img file. You can write this .img to a USB using something like Win32DiskImager.

**Note: This will wipe the USB drive, ensure you select the correct drive and that you're OK with that before doing this**

![](https://i.imgur.com/qpiVQGo.png)

When running the exploit on the PS4, wait until it reaches an alert with "Insert USB now. do not close the dialog until notification pops, remove usb after closing it.". As the dialog states, insert the USB, and wait until the "disk format not supported" notification appears, then close out of the alert with "OK".

It may take a minute for the exploit to run, and the spinning animation on the page might freeze - this is fine, let it continue until an error shows or it succeeds and displays "Awaiting payload".

## Notes
- You need to insert the USB when the alert pops up, then let it sit there for a bit until the ps4 storage notifications shows up.
- Unplug the USB before a (re)boot cycle or you'll risk corrupting the kernel heap at boot.
- The browser might tempt you into closing the page prematurely, don't.
- The loading circle might freeze while the webkit exploit is triggering, this means nothing.
- This bug works on certain PS5 firmwares, however there's no known strategy for exploiting it at the moment. Using this bug against the PS5 blind wouldn't be advised.

## Contributors

- laureeeeeee
- [Specter](https://twitter.com/SpecterDev)
- [Znullptr](https://twitter.com/Znullptr)

## Special Thanks
- [Andy Nguyen](https://twitter.com/theflow0)
- [sleirsgoevy](https://twitter.com/sleirsgoevy) - [9.00 Webkit exploit](https://gist.github.com/sleirsgoevy/6beca32893909095f4bba1ce29167992)
