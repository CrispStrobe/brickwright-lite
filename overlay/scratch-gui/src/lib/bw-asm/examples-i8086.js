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
 *            file: string, expect: string}} I8086Example
 *   `file` is the path inside the upstream repository — provenance a reader
 *   can check. `expect` is a line the program must actually print, which is
 *   what makes "it runs" a testable claim rather than a hope.
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
].map(e => ({...e, attribution: AMEY_THAKUR}));

export default I8086_EXAMPLES;
