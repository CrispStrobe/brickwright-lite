/**
 * MakeCode Arcade Asset Editor preset palettes, copied from Microsoft PXT (MIT) at
 * https://github.com/microsoft/pxt/blob/a13d2a0211748bcf194bcbd6ab38d5a4b8d79256/react-common/components/palette/Palettes.ts
 * Index 0 is transparency in Brickwright; preset RGB values occupy indices 1–15.
 */
import {ARCADE_PALETTE} from './pixel-image.js';

export const PALETTE_PRESETS = [
    {id: 'Arcade', colors: ARCADE_PALETTE},
    {id: 'Matte', colors: [
        null, '#fff1e8', '#ff004d', '#ff77a8', '#ffa300', '#ffec27',
        '#008751', '#00e436', '#29adff', '#c2c3c7', '#7e2553',
        '#83769c', '#5f574f', '#ffccaa', '#ab5236', '#1d2b53'
    ]},
    {id: 'Pastel', colors: [
        null, '#fff7e4', '#f98284', '#feaae4', '#ffc384', '#fff7a0',
        '#87a889', '#b0eb93', '#b0a9e4', '#accce4', '#b3e3da',
        '#d9c8bf', '#6c5671', '#ffe6c6', '#dea38b', '#28282e'
    ]},
    {id: 'Sweet', colors: [
        null, '#f4f4f4', '#b13e53', '#a7f070', '#ef7d57', '#ffcd75',
        '#257179', '#38b764', '#29366f', '#3b5dc9', '#41a6f6',
        '#566c86', '#333c57', '#94b0c2', '#5d275d', '#1a1c2c'
    ]},
    {id: 'Poke', colors: [
        null, '#ffffff', '#d45362', '#e8958b', '#cc8945', '#f5dc8c',
        '#417d53', '#5dd48f', '#5162c2', '#6cadeb', '#b56edd',
        '#8f3f29', '#612431', '#c0fac2', '#24325e', '#1b1221'
    ]},
    {id: 'Adventure', colors: [
        null, '#f5edba', '#9d303b', '#d26471', '#e4943a', '#c0c741',
        '#647d34', '#34859d', '#17434b', '#7ec4c1', '#584563',
        '#8c8fae', '#3e2137', '#d79b7d', '#9a6348', '#1f0e1c'
    ]},
    {id: 'DIY', colors: [
        null, '#f8f8f8', '#f80000', '#ff93c4', '#f8a830', '#f8f858',
        '#089050', '#70d038', '#2868c0', '#10c0c8', '#c868e8',
        '#c0c0c0', '#787878', '#f8d898', '#c04800', '#000000'
    ]},
    {id: 'Adafruit', colors: [
        null, '#ffffff', '#ff0000', '#ff007d', '#ff7a00', '#e5ff00',
        '#2d9f00', '#00ff72', '#0034ff', '#17abff', '#c600ff',
        '#636363', '#7400db', '#00efff', '#df2929', '#000000'
    ]},
    {id: 'StillLife', colors: [
        null, '#a8e4d4', '#d13b27', '#e07f8a', '#cc8218', '#b3e868',
        '#5d853a', '#68c127', '#286fb8', '#9b8bff', '#3f2811',
        '#513155', '#122615', '#c7b581', '#7a2222', '#000000'
    ]},
    {id: 'SteamPunk', colors: [
        null, '#c0d1cc', '#603b3a', '#170e19', '#775c4f', '#77744f',
        '#4f7754', '#a19f7c', '#4f5277', '#65738c', '#3a604a',
        '#213b25', '#433a60', '#7c94a1', '#3b2137', '#2f213b'
    ]},
    {id: 'Grayscale', colors: [
        null, '#ffffff', '#ededed', '#dbdbdb', '#c8c8c8', '#b6b6b6',
        '#a4a4a4', '#929292', '#808080', '#6d6d6d', '#5b5b5b',
        '#494949', '#373737', '#242424', '#121212', '#000000'
    ]},
];
