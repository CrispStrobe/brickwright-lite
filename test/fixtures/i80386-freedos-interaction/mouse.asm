# Owned 16-bit DOS probe. Enables the PS/2 auxiliary device, polls one packet,
# prints its three bytes through DOS, disables reporting and exits. This tests
# guest hardware input; it is not an INT33 mouse driver.
.intel_syntax noprefix
.code16
.global _start
_start:
 push cs
 pop ds
 call wait_input
 mov al, 0xa8
 out 0x64, al
 call wait_input
 mov al, 0xd4
 out 0x64, al
 call wait_input
 mov al, 0xf4
 out 0x60, al
ack:
 call read_aux
 cmp al, 0xfa
 jne ack
 mov dx, offset ready
 mov ah, 9
 int 0x21
 mov bx, offset packet
 mov cx, 3
packet_loop:
 call read_aux
 mov [bx], al
 inc bx
 loop packet_loop
 mov dx, offset received
 mov ah, 9
 int 0x21
 mov si, offset packet
 mov cx, 3
print_loop:
 lodsb
 push ax
 shr al, 4
 call hex
 pop ax
 and al, 15
 call hex
 mov dl, ' '
 mov ah, 2
 int 0x21
 loop print_loop
 mov dx, offset done
 mov ah, 9
 int 0x21
 call wait_input
 mov al, 0xd4
 out 0x64, al
 call wait_input
 mov al, 0xf5
 out 0x60, al
stop_ack:
 call read_aux
 cmp al, 0xfa
 jne stop_ack
 mov ax, 0x4c00
 int 0x21
wait_input:
 in al, 0x64
 test al, 2
 jnz wait_input
 ret
read_aux:
 in al, 0x64
 and al, 0x21
 cmp al, 0x21
 jne read_aux
 in al, 0x60
 ret
hex:
 cmp al, 10
 jb digit
 add al, 7
digit:
 add al, '0'
 mov dl, al
 mov ah, 2
 int 0x21
 ret
ready: .ascii "\r\nPS2 READY$"
received: .ascii "\r\nPS2 PACKET $"
done: .ascii "\r\nPS2 DONE\r\n$"
packet: .byte 0,0,0
