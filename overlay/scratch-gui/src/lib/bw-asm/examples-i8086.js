/**
 * The 8086's starter programs, and the licence terms that make them
 * shippable.
 *
 * WHERE THESE COME FROM. Every one is a file from Amey Thakur and Mega
 * Satish's 525-program teaching corpus, MIT-licensed, carried VERBATIM —
 * including its own header, which names the author, the repository and the
 * licence, and is the first thing the learner sees when the program lands in
 * the editor. That is not decoration: MIT asks for the copyright notice and
 * the permission notice to travel with the code, and an example whose
 * attribution had been tidied away would not be one we are allowed to ship.
 * `THIRD-PARTY-NOTICES.md`, the About dialog and
 * `static/licenses/amey-thakur-8086.MIT.txt` carry the full text;
 * `test/notices-coverage.test.mjs` refuses the build if any of that goes
 * missing.
 *
 * VERBATIM, and that is a rule rather than laziness. The only edits are
 * CRLF → LF and trailing whitespace, both of which git would have made
 * anyway. Nothing is retitled, no comment is trimmed, and the long
 * "TECHNICAL NOTES" tail on each file stays — it is the half that teaches,
 * and `test/i8086-asm-examples.test.mjs` compares the shipped text against
 * the upstream file when a checkout is present, so a silent edit here shows
 * up as a failure rather than as a divergence nobody notices.
 *
 * WHY THESE SIX, out of 525. Each was chosen against one rule: it must
 * TERMINATE and it must PUT SOMETHING ON THE SCREEN. An example that loads
 * and shows a blank screen is worse than one that is absent, because the
 * learner cannot tell it apart from a broken emulator — so `expect` records
 * a line the program's output must contain, and the gate boots each one on
 * the same DOS bench the ▶ button boots and reads it back off the CGA text
 * page. None of the six asks for a keystroke (there is no keyboard on this
 * bench yet), none needs a video mode the renderer refuses, and none touches
 * the filesystem.
 *
 * WHAT IS DELIBERATELY NOT HERE. The four NASM corpora on the same shelf —
 * the Snake, Breakout, typing-balloon and retro-dos-graphics games — are
 * absent for two reasons, neither of them licence: this assembler reads MASM
 * and not NASM, and the BIOS graphics services those games draw through
 * (INT 10h AH=0Ch/0Dh) do not exist yet. Both are other people's lanes. A
 * game shipped today would assemble into nothing or run into a black screen,
 * which is the exact failure the rule above exists to prevent.
 *
 * @module
 */

/**
 * @typedef {{author: string, repo: string, licence: string}} Attribution
 */

/**
 * One attribution for all six, because all six come from one repository.
 * The tab renders it beside the picker; the source header carries it into
 * the editor. Two places on purpose — a learner who copies the text out of
 * the editor takes the notice with them.
 */
export const AMEY_THAKUR = Object.freeze({
    author: 'Amey Thakur and Mega Satish',
    repo: 'https://github.com/Amey-Thakur/8086-ASSEMBLY-LANGUAGE-PROGRAMS',
    licence: 'MIT'
});

/**
 * @typedef {{id: string, label: string, labelDe: string, source: string,
 *            file: string, expect: string, warns: string[]}} I8086Example
 *   `file` is the path inside the upstream repository — provenance a reader
 *   can check. `expect` is a line the program must actually print, which is
 *   what makes "it runs" a testable claim rather than a hope.
 *
 *   `warns` is the list of assembler warnings the program is KNOWN to
 *   produce, and it is a declaration rather than a suppression: the gate
 *   compares it exactly, so a new warning appearing is a failure and a
 *   declared one disappearing is too. An example that assembled differently
 *   from what was written, without anyone having decided that was fine, is
 *   the thing this field exists to prevent.
 */

/** @type {I8086Example[]} */
export const I8086_EXAMPLES = [
    {
        id: 'hello',
        label: 'Hello, World! (segmented .EXE)',
        labelDe: 'Hallo, Welt! (segmentierte .EXE)',
        file: 'Introduction/hello_world_string.asm',
        expect: 'Hello, World!',
        source: `; =============================================================================
; TITLE: Hello World (Segmented EXE style)
; DESCRIPTION: Standard multi-segment application structure displaying
;              a string using DOS services.
; AUTHOR: Amey Thakur (https://github.com/Amey-Thakur)
; REPOSITORY: https://github.com/Amey-Thakur/8086-ASSEMBLY-LANGUAGE-PROGRAMS
; LICENSE: MIT License
; =============================================================================

; -----------------------------------------------------------------------------
; DATA SEGMENT
; -----------------------------------------------------------------------------
DATA SEGMENT
    MSG DB "Hello, World!$"
DATA ENDS

; -----------------------------------------------------------------------------
; CODE SEGMENT
; -----------------------------------------------------------------------------
CODE SEGMENT
    ASSUME CS:CODE, DS:DATA

START:
    ; Standard Initialization for Segmented EXE
    MOV AX, DATA                    ; Load segment address of DATA
    MOV DS, AX                      ; Point DS to it

    ; Prepare string output
    LEA DX, MSG                     ; Load offset of the string
    MOV AH, 09H                     ; DOS function: display string
    INT 21H                         ; Call DOS system services

EXIT:
    ; Terminate process (Standard DOS Exit)
    MOV AX, 4C00H                   ; AH=4Ch (Exit), AL=00h (Return Code)
    INT 21H                         ; Return control to MS-DOS

CODE ENDS

END START

; =============================================================================
; TECHNICAL NOTES
; =============================================================================
; 1. ARCHITECTURE:
;    - EXE files can have multiple segments (Code, Data, Stack).
;    - 'ASSUME' tells the assembler which segment register points where.
;    - 'MOV DS, AX' is required because you cannot move immediate values
;      directly into segment registers.
; = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
`
    },
    {
        id: 'loop',
        label: 'Count 1-9 with LOOP',
        labelDe: 'Mit LOOP von 1 bis 9 zählen',
        file: 'Control Flow/loop_instruction_cx_register_control.asm',
        expect: 'Counting Sequence: 1 2 3 4 5 6 7 8 9',
        source: `; =============================================================================
; TITLE: Loop Instruction (CX Register Hardware Control)
; DESCRIPTION: This program demonstrates the specific hardware-accelerated
;              looping mechanism of the 8086. It utilizes the CX (Count)
;              register and the LOOP primitive to perform iterative logic
;              with minimal instruction overhead.
; AUTHOR: Amey Thakur (https://github.com/Amey-Thakur)
; REPOSITORY: https://github.com/Amey-Thakur/8086-ASSEMBLY-LANGUAGE-PROGRAMS
; LICENSE: MIT License
; =============================================================================

.MODEL SMALL
.STACK 100H

; -----------------------------------------------------------------------------
; DATA SEGMENT
; -----------------------------------------------------------------------------
.DATA
    MSG_HEADER    DB 'Counting Sequence: $'
    MSG_NEWLINE   DB 0DH, 0AH, '$'
    VAL_START_DIG DB '1'                 ; Starting ASCII digit

; -----------------------------------------------------------------------------
; CODE SEGMENT
; -----------------------------------------------------------------------------
.CODE
MAIN PROC
    ; --- Step 1: Initialize Data Segment ---
    MOV AX, @DATA
    MOV DS, AX

    ; --- Step 2: Display Header ---
    LEA DX, MSG_HEADER
    MOV AH, 09H
    INT 21H

    ; --- Step 3: Setup Loop Counter ---
    ; On the 8086, the 'LOOP' instruction specifically targets the CX register.
    MOV CX, 9                           ; Perform 9 iterations
    MOV DL, VAL_START_DIG               ; Load initial digit for display

    ; --- Step 4: Iterative Execution ---
L_ITERATE:
    ; Display current character (stored in DL)
    MOV AH, 02H                         ; DOS: Display character
    INT 21H

    ; Space separator for readability
    PUSH DX                             ; Save current digit/pointer
    MOV DL, ' '
    MOV AH, 02H
    INT 21H
    POP DX                              ; Restore current digit

    INC DL                              ; Move to next ASCII character

    ; The 'LOOP' primitive effectively performs:
    ; (1) CX = CX - 1
    ; (2) IF CX != 0 THEN JUMP TO label
    LOOP L_ITERATE

    ; --- Step 5: Termination Cleanup ---
    LEA DX, MSG_NEWLINE
    MOV AH, 09H
    INT 21H

    MOV AH, 4CH
    INT 21H
MAIN ENDP

END MAIN

; =============================================================================
; TECHNICAL NOTES & ARCHITECTURAL INSIGHTS
; =============================================================================
; 1. THE ZERO-COUNT TRAP:
;    A critical behavior to note: if CX is 0 when the 'LOOP' instruction is
;    reached, the CPU will decrement it to 0FFFFH and attempt to loop
;    65,536 times. Defensive programmers often use 'JCXZ' (Jump if CX is Zero)
;    before entering a loop to prevent this overflow.
;
; 2. HARDWARE OPTIMIZATION:
;    The 'LOOP' instruction is a micro-coded primitive. It is more compact
;    (2 bytes) than the equivalent manual sequence 'DEC CX' (1 byte) +
;    'JNZ label' (2 bytes), saving instruction cache space.
;
; 3. DISTANCE LIMITS:
;    Like conditional jumps, 'LOOP' is a SHORT jump. The target label must
;    be within -128 to +127 bytes relative to the instruction pointer.
;
; 4. SPECIALIZED LOOP VARIANTS:
;    - LOOPE/LOOPZ (Loop while Equal): Continues while CX > 0 AND ZF=1.
;      Ideal for searching an array for the first non-matching byte.
;    - LOOPNE/LOOPNZ (Loop while Not Equal): Continues while CX > 0 AND ZF=0.
;      Ideal for searching an array for a specific target value.
;
; 5. FLAG TRANSPARENCY:
;    Crucially, 'LOOP' DOES NOT affect the processor flags. This allows high-level
;    logic within the loop to preserve the results of comparisons across
;    multiple iterations without 'LOOP' interfering with the Zero or Carry flags.
; = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
`
    },
    {
        id: 'hex',
        label: 'Print a word as hexadecimal',
        labelDe: 'Ein Wort hexadezimal ausgeben',
        file: 'Input Output/display_hex.asm',
        expect: 'Hex Output: 0xBEEF',
        // `ROL BX, 4` is an 80186 instruction. On an 8086 its opcode C1
        // decodes as `RET imm16`, so emitting it would not be a slightly
        // wrong program — it would be one that returns instead of rotating.
        // The assembler expands it into four single rotations, which is
        // identical for CF/ZF/SF/PF and differs only in OF, which the 8086
        // leaves undefined for counts above one. Fifty-two files in this
        // corpus write it. Declared here, shown in the tab's status line,
        // and never silent.
        warns: ['ROL by 4 expanded into 4 single shifts: the immediate-count form is an 80186 instruction'],
        source: `; =============================================================================
; TITLE: Display Hexadecimal Representation
; DESCRIPTION: Converts a 16-bit integer into its Hexadecimal (Base 16) ASCII
;              string using bitwise rotation and lookup logic.
; AUTHOR: Amey Thakur (https://github.com/Amey-Thakur)
; REPOSITORY: https://github.com/Amey-Thakur/8086-ASSEMBLY-LANGUAGE-PROGRAMS
; LICENSE: MIT License
; =============================================================================

.MODEL SMALL
.STACK 100H

; -----------------------------------------------------------------------------
; DATA SEGMENT
; -----------------------------------------------------------------------------
.DATA
    TEST_VAL    DW 0BEEFH               ; Example Value
    MSG_OUT     DB "Hex Output: 0x$"

; -----------------------------------------------------------------------------
; CODE SEGMENT
; -----------------------------------------------------------------------------
.CODE
MAIN PROC
    ; --- Step 1: Initialize DS ---
    MOV AX, @DATA
    MOV DS, AX

    ; --- Step 2: Display Header ---
    LEA DX, MSG_OUT
    MOV AH, 09H
    INT 21H

    ; --- Step 3: Print Hex ---
    MOV AX, TEST_VAL
    MOV BX, AX                          ; Copy to BX
    MOV CX, 4                           ; 4 Nibbles in 16 bits (4x4=16)

L_HEX_LOOP:
    ROL BX, 4                           ; Rotate Left 4 to bring high nibble to low
    MOV DL, BL                          ; Move LOW Byte to DL
    AND DL, 0FH                         ; Mask out High Nibble of DL (0000xxxx)

    ; Convert 0-15 to ASCII
    CMP DL, 9
    JG L_LETTER
    ADD DL, '0'
    JMP L_PRINT

L_LETTER:
    ADD DL, 'A' - 10                    ; Convert 10-15 to A-F

L_PRINT:
    MOV AH, 02H
    INT 21H
    LOOP L_HEX_LOOP

    ; --- Step 4: Exit ---
    MOV AH, 4CH
    INT 21H
MAIN ENDP
END MAIN

; =============================================================================
; TECHNICAL NOTES & ARCHITECTURAL INSIGHTS
; =============================================================================
; 1. NIBBLE PROCESSING:
;    Hexadecimal maps directly to binary 4-bit chunks (nibbles).
;    - A word has 4 nibbles.
;    - ROL BX, 4 brings the next MS-Nibble to the LS-Nibble position sequentially.
;
; 2. ASCII CONVERSION:
;    - Values 0-9 map to '0'-'9' (0x30-0x39).
;    - Values 10-15 map to 'A'-'F' (0x41-0x46).
;    - 'A' is 65 (0x41). 10 + ('A'-10) = 65 correctly aligns the offset.
; = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
`
    },
    {
        id: 'fibonacci',
        label: 'Fibonacci series',
        labelDe: 'Fibonacci-Folge',
        file: 'Expression/fibonacci.asm',
        expect: '01, 01, 02, 03, 05, 08, 13, 21, 34, 55',
        source: `; =============================================================================
; TITLE: Fibonacci Series Generator
; DESCRIPTION: Generates and displays the Fibonacci sequence (1, 1, 2, 3...)
;              up to a specified count. Demonstrates iterative sequence
;              generation and register swapping logic.
; AUTHOR: Amey Thakur (https://github.com/Amey-Thakur)
; REPOSITORY: https://github.com/Amey-Thakur/8086-ASSEMBLY-LANGUAGE-PROGRAMS
; LICENSE: MIT License
; =============================================================================

.MODEL SMALL
.STACK 100H

; -----------------------------------------------------------------------------
; DATA SEGMENT
; -----------------------------------------------------------------------------
.DATA
    COUNT       DB 10                   ; Generate 10 terms
    TERM_A      DB 1                    ; T(n-2)
    TERM_B      DB 1                    ; T(n-1)

    MSG_SEP     DB ', $'

; -----------------------------------------------------------------------------
; CODE SEGMENT
; -----------------------------------------------------------------------------
.CODE
MAIN PROC
    ; --- Step 1: Initialize Data Segment ---
    MOV AX, @DATA
    MOV DS, AX

    ; --- Step 2: Handle First Two Terms ---
    ; Print Term 1 (1)
    MOV AL, TERM_A
    CALL PRINT_NUM
    LEA DX, MSG_SEP
    MOV AH, 09H
    INT 21H

    ; Print Term 2 (1)
    MOV AL, TERM_B
    CALL PRINT_NUM

    ; Adjust Loop Counter (Total - 2)
    MOV CH, 0
    MOV CL, COUNT
    SUB CL, 2

    ; --- Step 3: Generation Loop ---
GEN_LOOP:
    LEA DX, MSG_SEP
    MOV AH, 09H
    INT 21H

    ; Calculate Next: C = A + B
    MOV AL, TERM_A
    ADD AL, TERM_B
    MOV BL, AL                  ; Save C in BL

    ; Output C
    CALL PRINT_NUM

    ; Shift: A = B, B = C
    MOV AL, TERM_B
    MOV TERM_A, AL
    MOV TERM_B, BL

    LOOP GEN_LOOP

    ; --- Step 4: Exit ---
    MOV AH, 4CH
    INT 21H
MAIN ENDP

; -----------------------------------------------------------------------------
; PROCEDURE: PRINT_NUM
; INPUT:  AL = Number to print (0-99 supported for simplicity)
; -----------------------------------------------------------------------------
PRINT_NUM PROC
    PUSH AX
    PUSH DX

    AAM                         ; Split Byte to Digits (AH=Tens, AL=Units)
    ADD AX, 3030H               ; Convert to ASCII

    PUSH AX
    MOV DL, AH                  ; Print Tens
    MOV AH, 02H
    INT 21H
    POP AX

    MOV DL, AL                  ; Print Units
    MOV AH, 02H
    INT 21H

    POP DX
    POP AX
    RET
PRINT_NUM ENDP

END MAIN

; =============================================================================
; TECHNICAL NOTES & ARCHITECTURAL INSIGHTS
; =============================================================================
; 1. SERIES LOGIC:
;    Fibonacci(n) = Fibonacci(n-1) + Fibonacci(n-2).
;    We maintain the "trailing two" numbers in TERM_A and TERM_B.
;
; 2. REGISTER SWAPPING:
;    To advance the window [A, B] -> [B, A+B], we perform a 3-step value swap.
;    Since efficient swapping is key, keeping values in registers (AL, BL)
;    inside the loop is preferred over memory access.
;
; 3. OVERFLOW:
;    Using 8-bit registers limits the series to 255 (Term 13 is 233, Term 14
;    is 377). For larger series, 16-bit (DW) or 32-bit arithmetic is required.
; = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
`
    },
    {
        id: 'reverse',
        label: 'Reverse a string on the stack',
        labelDe: 'Zeichenkette über den Stack umkehren',
        file: 'Stack Operations/reverse_string_stack.asm',
        expect: 'Reversed: OLLEH',
        source: `; =============================================================================
; TITLE: Reverse String (Stack Implementation)
; DESCRIPTION: Utilize the stack's LIFO property to reverse a string's
;              character order.
; AUTHOR: Amey Thakur (https://github.com/Amey-Thakur)
; REPOSITORY: https://github.com/Amey-Thakur/8086-ASSEMBLY-LANGUAGE-PROGRAMS
; LICENSE: MIT License
; =============================================================================

.MODEL SMALL
.STACK 100H

; -----------------------------------------------------------------------------
; DATA SEGMENT
; -----------------------------------------------------------------------------
.DATA
    STR1        DB 'HELLO', '$'
    STR_LEN     EQU 5
    NEWLINE     DB 0DH, 0AH, '$'
    MSG_ORIG    DB 'Original: $'
    MSG_REV     DB 'Reversed: $'

; -----------------------------------------------------------------------------
; CODE SEGMENT
; -----------------------------------------------------------------------------
.CODE
MAIN PROC
    ; Setup Segment
    MOV AX, @DATA
    MOV DS, AX

    ; 1. Display Header
    LEA DX, MSG_ORIG
    MOV AH, 09H
    INT 21H
    LEA DX, STR1
    INT 21H

    ; 2. PUSH PHASE
    ; Push each character of the string onto the stack.
    LEA SI, STR1
    MOV CX, STR_LEN
PUSHING:
    MOV AL, [SI]                        ; Fetch char
    XOR AH, AH                          ; Clear high byte (Stack needs 16-bit)
    PUSH AX                             ; Push Word
    INC SI
    LOOP PUSHING

    ; Newline
    LEA DX, NEWLINE
    MOV AH, 09H
    INT 21H

    ; Label
    LEA DX, MSG_REV
    INT 21H

    ; 3. POP PHASE
    ; Pop values back. Since the stack is LIFO, the last char comes out first.
    MOV CX, STR_LEN
POPPING:
    POP AX                              ; Get char back (reversed order)
    MOV DL, AL
    MOV AH, 02H                         ; Print char in DL
    INT 21H
    LOOP POPPING

    ; Termination
    MOV AH, 4CH
    INT 21H
MAIN ENDP
END MAIN

; =============================================================================
; TECHNICAL NOTES
; =============================================================================
; 1. REVERSAL LOGIC:
;    - Stack is the ideal data structure for any "Reverse" operation.
;    - Pushing 'H', 'E', 'L', 'L', 'O' results in 'O' being at the top.
;    - Popping 'O', 'L', 'L', 'E', 'H' effectively reverses the sequence.
; = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
`
    },
    {
        id: 'colour',
        label: 'Colour blocks through the BIOS',
        labelDe: 'Farbige Blöcke über das BIOS',
        file: 'BIOS Services/bios_character_with_attribute.asm',
        expect: 'A bar drawn with service 09h:',
        source: `; =============================================================================
; TITLE: Writing a Character with a Colour
; DESCRIPTION: Uses service 09h to place a character with a chosen colour, and
;              repeats it, which teletype output cannot do.
; AUTHOR: Amey Thakur (https://github.com/Amey-Thakur)
; REPOSITORY: https://github.com/Amey-Thakur/8086-ASSEMBLY-LANGUAGE-PROGRAMS
; LICENSE: MIT License
; =============================================================================

.MODEL SMALL
.STACK 100H

; -----------------------------------------------------------------------------
; DATA SEGMENT
; -----------------------------------------------------------------------------
.DATA
    M_HEAD  DB 'A bar drawn with service 09h:', 0DH, 0AH, '$'
    M_TAIL  DB 0DH, 0AH, 'Each block was one call with a count of ten.', 0DH, 0AH, '$'

; -----------------------------------------------------------------------------
; CODE SEGMENT
; -----------------------------------------------------------------------------
.CODE
START:
    MOV AX, @DATA
    MOV DS, AX

    LEA DX, M_HEAD
    MOV AH, 09H
    INT 21H

    ; -------------------------------------------------------------------------
    ; SERVICE 09H WRITES THE CHARACTER IN AL, CX TIMES, WITH THE COLOUR IN BL.
    ; IT DOES NOT MOVE THE CURSOR, WHICH IS WHY IT CAN FILL A RUN IN ONE CALL
    ; AND WHY A PROGRAM USING IT HAS TO POSITION THE CURSOR ITSELF.
    ;
    ; THE ATTRIBUTE BYTE IS TWO NIBBLES: THE BACKGROUND ABOVE AND THE
    ; FOREGROUND BELOW, SO 1EH IS YELLOW ON BLUE.
    ; -------------------------------------------------------------------------
    MOV BL, 1EH                         ; Yellow on blue
    CALL DRAW_BLOCK

    MOV BL, 2FH                         ; White on green
    CALL DRAW_BLOCK

    MOV BL, 4EH                         ; Yellow on red
    CALL DRAW_BLOCK

    LEA DX, M_TAIL
    MOV AH, 09H
    INT 21H

    MOV AX, 4C00H
    INT 21H

; -----------------------------------------------------------------------------
; DRAW_BLOCK
;
; Writes ten blocks in the colour held in BL, then moves the cursor past them.
; -----------------------------------------------------------------------------
DRAW_BLOCK PROC
    PUSH AX
    PUSH BX
    PUSH CX
    PUSH DX

    MOV AH, 09H
    MOV AL, 0DBH                        ; The solid block character
    MOV BH, 0
    MOV CX, 10
    INT 10H

    ; Service 09h leaves the cursor where it was, so move it on by hand
    MOV AH, 03H
    MOV BH, 0
    INT 10H
    ADD DL, 10

    MOV AH, 02H
    MOV BH, 0
    INT 10H

    POP DX
    POP CX
    POP BX
    POP AX
    RET
DRAW_BLOCK ENDP

END START

; =============================================================================
; TECHNICAL NOTES
; =============================================================================
; 1. THE ATTRIBUTE IS TWO NIBBLES:
;    - Background in the high four bits, foreground in the low four. 1Eh
;    - is background one, blue, and foreground fourteen, yellow.
; 2. IT DOES NOT ADVANCE:
;    - Which is what makes a count useful and what makes the caller
;    - responsible for moving on. Service 0Eh advances and cannot repeat;
;    - these two together cover both needs.
; = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
`
    },
].map(e => ({warns: [], ...e, attribution: AMEY_THAKUR}));

/**
 * OUR OWN, and kept OUT of the map above because that map stamps Amey
 * Thakur's attribution onto everything it touches. Attributing our work to him
 * would be as wrong as leaving his off ours -- the blanket `.map` is a
 * convenience for a corpus that happens to be uniform, and the moment it is
 * not, riding on it is a licence error waiting to be copied.
 */
const OURS = [
    {
        id: 'pins',
        label: 'Blink an LED, read a switch (8255)',
        labelDe: 'LED blinken, Schalter lesen (8255)',
        expect: 'Watch the LED panel.',
        source: `; =============================================================================
; TITLE: An LED and a Switch on the 8255
; DESCRIPTION: The parallel port every 8086 breadboard hangs its lamps and
;              buttons off. Nothing here writes to the screen: the output IS
;              the pins, which is what the LED panel below shows.
; =============================================================================

PPI_A    EQU 60H          ; port A -- eight LEDs
PPI_C    EQU 62H          ; port C -- switches on the low half
PPI_CTRL EQU 63H          ; the control register. WRITE ONLY.

    ORG 100H

START:
    ; -------------------------------------------------------------------------
    ; ONE MODE WORD, AT THE START, AND ONLY ONE.
    ;
    ; 81h is mode 0 with port A an output, port B an output, port C's UPPER
    ; half an output and its LOWER half an INPUT. Port C is two half-ports with
    ; independent directions -- that is what makes it the handshake port on a
    ; real machine, and here it is why four switches and four lamps can share
    ; it.
    ;
    ; A MODE WORD CLEARS ALL THREE OUTPUT LATCHES. Write it again in the middle
    ; of the program and every lamp goes dark for the instant until the next
    ; write. That is real 8255 behaviour and it is why this is done once.
    ; -------------------------------------------------------------------------
    MOV DX, PPI_CTRL
    MOV AL, 81H
    OUT DX, AL

    XOR BL, BL                  ; BL shadows port A -- see the note below

MAIN:
    ; -------------------------------------------------------------------------
    ; READ THE SWITCHES. An 8255 input port returns what the OUTSIDE WORLD is
    ; holding the line at, not what anything wrote -- so this is the toggle a
    ; person just flipped.
    ;
    ; An undriven input floats HIGH, so a switch at rest reads 1 and CLOSING it
    ; pulls the line to 0. Every breadboard button is wired that way, which is
    ; why the test below is for ZERO.
    ; -------------------------------------------------------------------------
    MOV DX, PPI_C
    IN  AL, DX
    TEST AL, 1                  ; switch on PC0
    JNZ  OPEN

CLOSED:
    OR  BL, 0FH                 ; pressed: light the low four lamps
    JMP DRIVE

OPEN:
    AND BL, 0F0H                ; released: darken them, leave the rest

DRIVE:
    ; -------------------------------------------------------------------------
    ; WHY BL SHADOWS THE PORT. An 8255 output port CAN be read back, but what
    ; comes back is the latch -- so a read-modify-write works and tells you
    ; nothing about the world. Ports A and B also have no bit-set command, so
    ; the whole byte is written at once. Keeping the intended value in a
    ; register and writing it whole is what an 8051 program does with its port
    ; SFR, and what a real 8255 driver does too.
    ; -------------------------------------------------------------------------
    XOR BL, 80H                 ; blink the top lamp every pass
    MOV AL, BL
    MOV DX, PPI_A
    OUT DX, AL

    ; A pause, so the blink is visible rather than a blur. INT 15h/86h counts
    ; CX:DX microseconds of MACHINE time -- the 8254 on this bench is clocked
    ; from the CPU rather than the PC's 1.193182 MHz, so counting its ticks
    ; would be 4.19x wrong.
    MOV CX, 3
    MOV DX, 0D090H              ; 3*65536 + 53392 = 250,000 us
    MOV AH, 86H
    INT 15H

    JMP MAIN

; =============================================================================
; TECHNICAL NOTES
; =============================================================================
; 1. THIS PROGRAM NEVER EXITS, and that is correct. A panel of lamps and
;    switches is a thing you watch, not a thing that finishes. The bench
;    reports it as running rather than hung.
; 2. THE SAME CHIP CARRIES THE KEYBOARD on a PC -- port A at 60h is where the
;    scancode lands. On a board with a keyboard, put lamps on port B or C.
; = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
`
    },
    {
        id: 'keys',
        label: 'Type at it (INT 21h keyboard)',
        labelDe: 'Tastatureingabe (INT 21h)',
        expect: 'Type in the console. ESC quits.',
        source: `; =============================================================================
; TITLE: A Program That Waits For You
; DESCRIPTION: Every other example here runs to the end on its own. This one
;              STOPS and waits, which is the whole difference between a program
;              and a machine. Type in the console below; ESC ends it.
; =============================================================================

    ORG 100H

START:
    MOV DX, OFFSET PROMPT
    MOV AH, 9
    INT 21H

MAIN:
    ; -------------------------------------------------------------------------
    ; AH=01h READS ONE KEY AND WAITS FOR IT.
    ;
    ; "Waits" is doing real work. The bench does not hand the program a NUL and
    ; run on -- it declines the service and the CPU keeps burning cycles until
    ; a key actually arrives. So the program is genuinely BLOCKED, exactly as
    ; it would be on hardware, and the run status says "running" rather than
    ; pretending something finished.
    ;
    ; AH=01h also ECHOES. That is why a typed character appears without this
    ; program printing it.
    ; -------------------------------------------------------------------------
    MOV AH, 1
    INT 21H

    CMP AL, 1BH                 ; ESC?
    JE  DONE

    ; Show the code as two hex digits, so a key with no glyph still says
    ; something. AL holds the character; keep it while we take it apart.
    MOV BL, AL
    MOV DL, ' '
    MOV AH, 2
    INT 21H

    MOV AL, BL
    SHR AL, 1
    SHR AL, 1
    SHR AL, 1
    SHR AL, 1                   ; the high nibble
    CALL NIBBLE

    MOV AL, BL
    AND AL, 0FH                 ; the low nibble
    CALL NIBBLE

    MOV DL, 0DH
    MOV AH, 2
    INT 21H
    MOV DL, 0AH
    MOV AH, 2
    INT 21H
    JMP MAIN

DONE:
    MOV DX, OFFSET BYE
    MOV AH, 9
    INT 21H
    MOV AX, 4C00H
    INT 21H

; -----------------------------------------------------------------------------
; One hex digit from the low nibble of AL.
; -----------------------------------------------------------------------------
NIBBLE PROC
    ADD AL, '0'
    CMP AL, '9'
    JBE PRINT
    ADD AL, 7                   ; 'A'-'9'-1: skip the punctuation between them
PRINT:
    MOV DL, AL
    MOV AH, 2
    INT 21H
    RET
NIBBLE ENDP

PROMPT DB 'Type something. ESC quits.', 0DH, 0AH, '$'
BYE    DB 0DH, 0AH, 'Bye.', 0DH, 0AH, '$'

END START

; =============================================================================
; TECHNICAL NOTES
; =============================================================================
; 1. THIS BENCH HAS NO PIC, so there is no IRQ1 and no hardware scancode path.
;    The keyboard here IS the DOS queue: a program blocked in INT 21h wakes on
;    the next service call once a key is queued. A program that wants raw
;    scancodes from port 60h needs the hardware bench, not this one.
; 2. AH=01h ECHOES, AH=07h and AH=08h DO NOT. Use 07h when reading a password
;    or driving a game, where echoing would corrupt the display.
; = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
`
    },
    {
        id: 'mode13',
        label: 'Draw in 256 colours (VGA mode 13h)',
        labelDe: 'Zeichnen in 256 Farben (VGA Modus 13h)',
        expect: 'A colour texture. Press a key to quit.',
        source: `; =============================================================================
; TITLE: Mode 13h -- 320x200 in 256 Colours
; DESCRIPTION: The mode every DOS demo and half the games of the era used, for
;              one reason: 320*200 = 64000 bytes, which fits in a single 64K
;              segment. One byte is one pixel. No planes, no bit masks, no
;              banking -- you write a byte, a pixel changes colour.
; =============================================================================

    ORG 100H

START:
    ; -------------------------------------------------------------------------
    ; AH=00h, AL=13h: set the video mode. This CLEARS the screen, so it belongs
    ; before the drawing rather than after it.
    ; -------------------------------------------------------------------------
    MOV AX, 0013H
    INT 10H

    ; -------------------------------------------------------------------------
    ; THE FRAME BUFFER IS AT A000:0000 AND IT IS LINEAR.
    ;
    ; Pixel (x, y) is byte y*320 + x. That is what makes this mode the friendly
    ; one: mode 4's CGA buffer splits even and odd scanlines into two banks
    ; 8K apart, and mode 0Dh's EGA buffer needs four bit planes selected
    ; through a port. Here the address IS the arithmetic.
    ; -------------------------------------------------------------------------
    MOV AX, 0A000H
    MOV ES, AX
    XOR DI, DI                  ; ES:DI walks the whole 64000 bytes in order

    XOR DX, DX                  ; DX = y
ROW:
    XOR CX, CX                  ; CX = x
COL:
    ; The classic XOR texture: colour = x XOR y. It costs one instruction and
    ; it is not a flat fill -- which matters, because a screen filled with one
    ; colour looks identical to a screen that was never drawn on.
    MOV AX, CX
    XOR AX, DX
    STOSB                       ; write AL to ES:DI, then DI = DI + 1

    INC CX
    CMP CX, 320
    JB  COL

    INC DX
    CMP DX, 200
    JB  ROW

    ; -------------------------------------------------------------------------
    ; Wait, then put the text mode back. A graphics program that exits without
    ; restoring mode 3 leaves the shell drawing text into a 256-colour buffer,
    ; which on real hardware is a screenful of confetti.
    ; -------------------------------------------------------------------------
    MOV AH, 0
    INT 16H                     ; BIOS: wait for a keystroke

    MOV AX, 0003H
    INT 10H
    MOV AX, 4C00H
    INT 21H

END START

; =============================================================================
; TECHNICAL NOTES
; =============================================================================
; 1. STOSB USES ES:DI, NOT DS:SI. That is why ES is loaded and DS is left
;    alone -- the string instructions take their destination from ES, and it
;    is the one segment register a .COM program must set for itself here.
; 2. 64000 BYTES, NOT 65536. The last 1536 bytes of the segment are not on
;    screen. Writing past 63999 is harmless here and invisible on hardware.
; 3. THE PALETTE IS THE DEFAULT ONE. Mode 13h has 256 entries of 6-bit RGB,
;    reprogrammable through ports 3C8h/3C9h -- which is how a fade to black is
;    done without touching a single pixel.
; = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
`
    },
    {
        id: 'ether',
        label: 'Ethernet card self-test (NE2000)',
        labelDe: 'Netzwerkkarte testen (NE2000)',
        expect: 'Sends a frame and hears it come back.',
        source: `; =============================================================================
; TITLE: An NE2000 Talking To Itself
; DESCRIPTION: A network card with nothing plugged into it, doing what a real
;              one does at power-on: send a frame and check it comes back.
;              Every step here is what a driver does -- there is no library
;              between this program and the chip.
; =============================================================================
; BW-CHIPS: ne2000@320
;
; That comment line is not decoration. An assembly program has no PIN
; declarations, so it asks for hardware this way -- the bench reads it and
; puts a card at 320h with its transmit looped back to its own receiver.
; Without it the ports below are open bus and every read returns FFh.
;
; 320h and not 300h: the ADC0809 already lives at 300h, and two chips
; answering one address is a board that runs and reads the wrong device.
; =============================================================================

NIC      EQU 320H          ; the DP8390's sixteen registers
NIC_DATA EQU NIC + 10H     ; the remote DMA window
CR       EQU NIC + 0

    ORG 100H

START:
    ; -------------------------------------------------------------------------
    ; IS A CARD ACTUALLY THERE? Ask before believing anything it says.
    ;
    ; An absent card is open bus: every port answers FFh. Every ISR bit then
    ; reads SET, so the "did a packet arrive?" check below reports YES on a
    ; board with no card in it. This example printed exactly that -- a
    ; plausible success, with nothing wrong on its face -- until this check
    ; existed.
    ;
    ; The PROM is what open bus cannot forge. An NE2000 stores 'WW' (57h) at
    ; PROM offsets 28-29 to mark itself a 16-bit card, and FFh is not 57h.
    ; -------------------------------------------------------------------------
    MOV DX, CR
    MOV AL, 21H
    OUT DX, AL
    MOV DX, NIC + 8
    XOR AL, AL
    OUT DX, AL
    MOV DX, NIC + 9
    XOR AL, AL
    OUT DX, AL
    MOV DX, NIC + 0AH
    MOV AL, 30
    OUT DX, AL
    MOV DX, NIC + 0BH
    XOR AL, AL
    OUT DX, AL
    MOV DX, CR
    MOV AL, 0AH
    OUT DX, AL
    MOV CX, 28
    MOV DX, NIC_DATA
SKIPPROM:
    IN AL, DX
    LOOP SKIPPROM
    IN AL, DX                  ; PROM byte 28
    CMP AL, 57H
    JE  HAVECARD
    MOV DX, OFFSET NOCARD
    MOV AH, 9
    INT 21H
    MOV AX, 4C01H
    INT 21H
HAVECARD:

    ; -------------------------------------------------------------------------
    ; STOP THE CHIP BEFORE CONFIGURING IT. It comes up stopped and a driver's
    ; first act is to say so anyway: 21h is page 0, abort any DMA, STOP.
    ; -------------------------------------------------------------------------
    MOV DX, CR
    MOV AL, 21H
    OUT DX, AL

    MOV DX, NIC + 0EH      ; DCR: word mode, no loopback in the chip itself
    MOV AL, 49H
    OUT DX, AL

    ; -------------------------------------------------------------------------
    ; THE RECEIVE RING. PSTART..PSTOP are 256-byte pages of the card's own
    ; 16K buffer -- the host cannot address it directly, only through remote
    ; DMA. BNRY is the last page WE have finished with; CURR is where the
    ; card will write next. They meet when the ring is full, which is why a
    ; driver must advance BNRY as it reads.
    ; -------------------------------------------------------------------------
    MOV DX, NIC + 1
    MOV AL, 46H            ; PSTART
    OUT DX, AL
    MOV DX, NIC + 2
    MOV AL, 80H            ; PSTOP
    OUT DX, AL
    MOV DX, NIC + 3
    MOV AL, 46H            ; BNRY
    OUT DX, AL

    MOV DX, NIC + 0CH      ; RCR: accept broadcast
    MOV AL, 04H
    OUT DX, AL
    MOV DX, NIC + 0DH      ; TCR: normal operation
    XOR AL, AL
    OUT DX, AL

    MOV DX, CR             ; page 1
    MOV AL, 61H
    OUT DX, AL
    MOV DX, NIC + 7        ; CURR = one page past PSTART
    MOV AL, 47H
    OUT DX, AL
    MOV DX, CR             ; back to page 0, and START
    MOV AL, 22H
    OUT DX, AL

    ; -------------------------------------------------------------------------
    ; LOAD A FRAME INTO THE CARD'S BUFFER, through the only door there is.
    ; RSAR is where to write, RBCR is how many bytes; then every OUT to the
    ; data window moves one byte and the chip advances the address itself.
    ; -------------------------------------------------------------------------
    MOV DX, NIC + 8
    XOR AL, AL             ; RSAR low  = 00
    OUT DX, AL
    MOV DX, NIC + 9
    MOV AL, 40H            ; RSAR high = 40h -> page 40, the transmit buffer
    OUT DX, AL
    MOV DX, NIC + 0AH
    MOV AL, 14            ; RBCR low: fourteen bytes of header
    OUT DX, AL
    MOV DX, NIC + 0BH
    XOR AL, AL
    OUT DX, AL
    MOV DX, CR
    MOV AL, 12H            ; remote WRITE, start
    OUT DX, AL

    MOV SI, OFFSET FRAME
    MOV CX, 14
    MOV DX, NIC_DATA
PUSHB:
    MOV AL, [SI]
    OUT DX, AL
    INC SI
    LOOP PUSHB

    MOV DX, NIC + 4        ; TPSR: transmit from page 40h
    MOV AL, 40H
    OUT DX, AL
    MOV DX, NIC + 5        ; TBCR: fourteen bytes
    MOV AL, 14
    OUT DX, AL
    MOV DX, NIC + 6
    XOR AL, AL
    OUT DX, AL

    MOV DX, CR             ; START | TXP -- send it
    MOV AL, 26H
    OUT DX, AL

    ; -------------------------------------------------------------------------
    ; DID IT COME BACK? ISR bit 0 is PRX, "a packet was received". The card is
    ; looped back, so the frame it just sent is the frame it should hear.
    ; -------------------------------------------------------------------------
    MOV DX, NIC + 7
    IN AL, DX
    TEST AL, 01H
    JZ  NOTHING

    MOV DX, OFFSET GOTIT
    MOV AH, 9
    INT 21H
    JMP DONE

NOTHING:
    MOV DX, OFFSET SILENT
    MOV AH, 9
    INT 21H

DONE:
    MOV AX, 4C00H
    INT 21H

; A minimal Ethernet header: broadcast destination, our own source, and the
; type field. Fourteen bytes -- the card pads the rest to the sixty a wire
; requires, which is why what comes back is longer than what went out.
FRAME  DB 0FFH, 0FFH, 0FFH, 0FFH, 0FFH, 0FFH
       DB 002H, 000H, 000H, 08BH, 086H, 001H
       DB 008H, 000H

NOCARD DB 'No card answered at 320h -- the PROM signature is missing. Every', 0DH, 0AH
       DB 'port reads FFh with no card, and FFh has every status bit SET,', 0DH, 0AH
       DB 'so the checks below would report success on an empty board.', 0DH, 0AH, '\$'
GOTIT  DB 'The card heard its own frame.', 0DH, 0AH, '\$'
SILENT DB 'Nothing came back -- check the ring setup.', 0DH, 0AH, '\$'

END START

; =============================================================================
; TECHNICAL NOTES
; =============================================================================
; 1. THE HOST CANNOT SEE THE CARD'S MEMORY. Sixteen kilobytes live on the
;    card and every byte crosses through the remote-DMA window at +10h. That
;    is the whole shape of the chip: set an address, set a count, then move
;    bytes one at a time.
; 2. A FULL RING DROPS FRAMES AND SETS OVW rather than overwriting. A driver
;    that forgets to advance BNRY stops receiving after 16K with no error --
;    which is why BNRY and CURR are the two registers worth understanding.
; 3. WITH A SECOND MACHINE the loopback becomes a hub and this same program
;    talks to another 8086. The card cannot tell the difference; only the
;    board it is plugged into changes.
; = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
`
    },
    {
        id: 'ether2',
        label: 'Two cards on one wire (MAC filter)',
        labelDe: 'Zwei Karten an einem Draht (MAC-Filter)',
        expect: 'B hears one frame and ignores the other.',
        source: `; =============================================================================
; TITLE: Two Cards, One Wire
; DESCRIPTION: Two NE2000s on one board, joined by a hub, and the thing worth
;              watching is what card B DOES NOT hear. A hub is a repeater --
;              every card sees every frame -- so the MAC filter in the chip is
;              the only reason a frame is "yours".
; =============================================================================
; BW-CHIPS: ne2000@320, ne2000@340
;
; Two cards at two addresses. They are NOT at the same address, and the
; machine would refuse the board if they were: two chips answering one port
; is a board that runs and reads the wrong device.
;
; Asking for more than one card is what makes the bench build a HUB instead
; of a loopback. A switch would decide who gets what in the wire, and the
; lesson -- that the CHIP decides -- would be invisible.
; =============================================================================
A_NIC EQU 320H
B_NIC EQU 340H

    ORG 100H
START:
    ; IS THERE A CARD? Open bus answers FFh to every port, and FFh has every
    ; status bit SET -- so the "did B receive it?" check below reports YES on
    ; an empty board. This example printed exactly that until this existed.
    ; 'WW' (57h) at PROM offset 28 is what open bus cannot forge.
    MOV DX, A_NIC
    MOV AL, 21H
    OUT DX, AL
    MOV DX, A_NIC + 8
    XOR AL, AL
    OUT DX, AL
    MOV DX, A_NIC + 9
    XOR AL, AL
    OUT DX, AL
    MOV DX, A_NIC + 0AH
    MOV AL, 30
    OUT DX, AL
    MOV DX, A_NIC + 0BH
    XOR AL, AL
    OUT DX, AL
    MOV DX, A_NIC
    MOV AL, 0AH
    OUT DX, AL
    MOV CX, 28
    MOV DX, A_NIC + 10H
SKIPPROM:
    IN AL, DX
    LOOP SKIPPROM
    IN AL, DX
    CMP AL, 57H
    JE  HAVECARDS
    MOV DX, OFFSET NOCARDS
    MOV AH, 9
    INT 21H
    MOV AX, 4C01H
    INT 21H
HAVECARDS:

    MOV BX, A_NIC
    MOV SI, OFFSET MAC_A
    CALL SETUP
    MOV BX, B_NIC
    MOV SI, OFFSET MAC_B
    CALL SETUP

    ; --- A sends a frame addressed to B -------------------------------------
    MOV SI, OFFSET TO_B
    CALL SEND_A
    MOV DX, B_NIC + 7
    IN AL, DX
    TEST AL, 01H
    JZ  MISS1
    MOV DX, OFFSET GOT
    MOV AH, 9
    INT 21H
    JMP SECOND
MISS1:
    MOV DX, OFFSET NOGOT
    MOV AH, 9
    INT 21H

    ; --- A sends a frame addressed to a stranger ----------------------------
SECOND:
    MOV DX, B_NIC + 7          ; clear B's ISR
    MOV AL, 0FFH
    OUT DX, AL
    MOV SI, OFFSET TO_NOBODY
    CALL SEND_A
    MOV DX, B_NIC + 7
    IN AL, DX
    TEST AL, 01H
    JNZ WRONG
    MOV DX, OFFSET IGNORED
    MOV AH, 9
    INT 21H
    JMP DONE
WRONG:
    MOV DX, OFFSET TOOK
    MOV AH, 9
    INT 21H
DONE:
    MOV AX, 4C00H
    INT 21H

; BX = card base, SI = its six-byte MAC
SETUP PROC
    MOV DX, BX
    MOV AL, 21H
    OUT DX, AL
    LEA DX, [BX + 0EH]
    MOV AL, 49H
    OUT DX, AL
    LEA DX, [BX + 1]
    MOV AL, 46H
    OUT DX, AL
    LEA DX, [BX + 2]
    MOV AL, 80H
    OUT DX, AL
    LEA DX, [BX + 3]
    MOV AL, 46H
    OUT DX, AL
    LEA DX, [BX + 0CH]
    MOV AL, 04H
    OUT DX, AL
    LEA DX, [BX + 0DH]
    XOR AL, AL
    OUT DX, AL
    MOV DX, BX                 ; page 1
    MOV AL, 61H
    OUT DX, AL
    MOV CX, 6
    LEA DX, [BX + 1]
PAR:
    MOV AL, [SI]
    OUT DX, AL
    INC SI
    INC DX
    LOOP PAR
    LEA DX, [BX + 7]
    MOV AL, 47H
    OUT DX, AL
    MOV DX, BX
    MOV AL, 22H
    OUT DX, AL
    RET
SETUP ENDP

; SI = a 14-byte frame; sends it from card A
SEND_A PROC
    MOV DX, A_NIC + 8
    XOR AL, AL
    OUT DX, AL
    MOV DX, A_NIC + 9
    MOV AL, 40H
    OUT DX, AL
    MOV DX, A_NIC + 0AH
    MOV AL, 14
    OUT DX, AL
    MOV DX, A_NIC + 0BH
    XOR AL, AL
    OUT DX, AL
    MOV DX, A_NIC
    MOV AL, 12H
    OUT DX, AL
    MOV CX, 14
    MOV DX, A_NIC + 10H
PUSHB:
    MOV AL, [SI]
    OUT DX, AL
    INC SI
    LOOP PUSHB
    MOV DX, A_NIC + 4
    MOV AL, 40H
    OUT DX, AL
    MOV DX, A_NIC + 5
    MOV AL, 14
    OUT DX, AL
    MOV DX, A_NIC + 6
    XOR AL, AL
    OUT DX, AL
    MOV DX, A_NIC
    MOV AL, 26H
    OUT DX, AL
    RET
SEND_A ENDP

MAC_A DB 002H, 000H, 000H, 000H, 000H, 00AH
MAC_B DB 002H, 000H, 000H, 000H, 000H, 00BH
TO_B  DB 002H, 000H, 000H, 000H, 000H, 00BH
      DB 002H, 000H, 000H, 000H, 000H, 00AH
      DB 008H, 000H
TO_NOBODY DB 002H, 000H, 000H, 000H, 000H, 0CCH
      DB 002H, 000H, 000H, 000H, 000H, 00AH
      DB 008H, 000H

NOCARDS DB 'No card answered at 320h -- the PROM signature is missing.', 0DH, 0AH, '$'
GOT     DB 'B received the frame addressed to it.', 0DH, 0AH, '$'
NOGOT   DB 'B heard nothing -- check the ring.', 0DH, 0AH, '$'
IGNORED DB 'B ignored the frame addressed to someone else.', 0DH, 0AH, '$'
TOOK    DB 'B took a frame that was not its own -- the filter is wrong.', 0DH, 0AH, '$'
END START

; =============================================================================
; TECHNICAL NOTES
; =============================================================================
; 1. A HUB IS A REPEATER, NOT A SWITCH. Both cards hear both frames. B's
;    silence on the second one is the filter working, not the wire being
;    clever -- and that is the difference between the two devices.
; 2. RCR DECIDES WHAT COUNTS AS YOURS. 04h here accepts broadcast plus your
;    own address. Setting bit 4 makes the card promiscuous and it accepts
;    everything -- which is what a packet sniffer is, in one bit.
; 3. A CARD NEVER HEARS ITSELF on a hub. That is why the single-card example
;    uses a loopback instead: with one card and a hub there is nobody to
;    talk to.
; = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
`
    },
];

export default [...I8086_EXAMPLES, ...OURS];
