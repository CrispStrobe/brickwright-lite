/**
 * MakeCode's `IconNames` as our 5x5 brightness patterns.
 *
 * `basic.showIcon(IconNames.Heart)` is in nearly every beginner MakeCode
 * program, and refusing it would gut most imports. It has an exact
 * equivalent here: our `show pattern` lowers to `display.show(...)` in
 * MicroPython, and MakeCode's icons ARE MicroPython's built-in images —
 * both trace to the same table in bbcmicrobit/micropython, which is where
 * 38 of the 40 icons and all 8 arrows came from (MIT, (c) 2015 Damien P.
 * George and the MicroPython-on-micro:bit developers).
 *
 * Rabbit and Cow exist only in MakeCode, so those two were read off
 * pxt-microbit's own icon renders (MIT) by sampling the centre of each
 * cell. That method was checked against the bitmap table on the icons
 * both sources have: it agrees on 31 of 35 and loses a single edge pixel
 * on four, so the bitmaps win wherever they have an entry.
 *
 * @module
 */

/** @type {Object<string, string>} IconNames member → `show pattern` digits */
export const MICROBIT_ICONS = {
    Heart: '09090:99999:99999:09990:00900',
    SmallHeart: '00000:09090:09990:00900:00000',
    Yes: '00000:00009:00090:90900:09000',
    No: '90009:09090:00900:09090:90009',
    Happy: '00000:09090:00000:90009:09990',
    Sad: '00000:09090:00000:09990:90009',
    Confused: '00000:09090:00000:09090:90909',
    Angry: '90009:09090:00000:99999:90909',
    Asleep: '00000:99099:00000:09990:00000',
    Surprised: '09090:00000:00900:09090:00900',
    Silly: '90009:00000:99999:00909:00999',
    Fabulous: '99999:99099:00000:09090:09990',
    Meh: '09090:00000:00090:00900:09000',
    TShirt: '99099:99999:09990:09990:09990',
    Rollerskate: '00099:00099:99999:99999:09090',
    Duck: '09900:99900:09999:09990:00000',
    House: '00900:09990:99999:09990:09090',
    Tortoise: '00000:09990:99999:09090:00000',
    Butterfly: '99099:99999:00900:99999:99099',
    StickFigure: '00900:99999:00900:09090:90009',
    Ghost: '99999:90909:99999:99999:90909',
    Sword: '00900:00900:00900:09990:00900',
    Giraffe: '99000:09000:09000:09990:09090',
    Skull: '09990:90909:99999:09990:09990',
    Umbrella: '09990:99999:00900:90900:09900',
    Snake: '99000:99099:09090:09990:00000',
    Rabbit: '90900:90900:99990:99090:99990',
    Cow: '90009:90009:99999:09990:00900',
    QuarterNote: '00900:00900:00900:99900:99900',
    EighthNote: '00900:00990:00909:99900:99900',
    Pitchfork: '90909:90909:99999:00900:00900',
    Target: '00900:09990:99099:09990:00900',
    Triangle: '00000:00900:09090:99999:00000',
    LeftTriangle: '90000:99000:90900:90090:99999',
    Chessboard: '09090:90909:09090:90909:09090',
    Diamond: '00900:09090:90009:09090:00900',
    SmallDiamond: '00000:00900:09090:00900:00000',
    Square: '99999:90009:90009:90009:99999',
    SmallSquare: '00000:09990:09090:09990:00000',
    Scissors: '99009:99090:00900:99090:99009'
};

/** @type {Object<string, string>} ArrowNames member → `show pattern` digits */
export const MICROBIT_ARROWS = {
    North: '00900:09990:90909:00900:00900',
    NorthEast: '00999:00099:00909:09000:90000',
    East: '00900:00090:99999:00090:00900',
    SouthEast: '90000:09000:00909:00099:00999',
    South: '00900:00900:90909:09990:00900',
    SouthWest: '00009:00090:90900:99000:99900',
    West: '00900:09000:99999:09000:00900',
    NorthWest: '99900:99000:90900:00090:00009'
};

export default MICROBIT_ICONS;
