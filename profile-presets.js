// Single source for SYS.PROFILE and TXT.EXTRACT fonts and themes.
(function (root) {
  "use strict";
  const FONTS = [
    { id: "d2", label: "D2Coding", family: "D2Coding", sample: "한글 Aa 012" },
    { id: "mona", label: "Mona", family: "Mona12", sample: "픽셀 코딩체" },
    {
      id: "nanum",
      label: "나눔고딕코딩",
      family: "Nanum Gothic Coding",
      sample: "한글 Aa 012",
    },
    { id: "orbit", label: "Orbit", family: "Orbit", sample: "한글 Aa 012" },
    {
      id: "elice",
      label: "엘리스 디지털 배움",
      family: "EllisDigitalCoding",
      sample: "한글 Aa 012",
    },
    {
      id: "intel",
      label: "Intel One Mono",
      family: "IntelOneMono",
      sample: "Aa 012 / 한글 D2",
    },
    {
      id: "cloud",
      label: "구름 산스 코드",
      family: "CloudSansCode",
      sample: "한글 Aa 012",
    },
    {
      id: "intel-italic",
      label: "Intel One Mono Italic",
      family: "IntelOneMonoItalic",
      italic: true,
      sample: "Aa 012 / 한글 D2",
    },
  ];
  const THEMES = [
    {
      id: "crimson",
      name: "RED WOLFIE",
      label: "레드 울피",
      accent: "#ff2949",
      bg1: "#190006",
      bg2: "#000000",
    },
    {
      id: "pink",
      name: "LOVE PINK",
      label: "러브 핑크",
      accent: "#ff69b4",
      bg1: "#fff0f5",
      bg2: "#ffe6f0",
    },
    {
      id: "cobalt",
      name: "DRAGON BLUE",
      label: "드래곤 블루",
      accent: "#6eacff",
      bg1: "#00173D",
      bg2: "#010713",
    },
    {
      id: "violet",
      name: "GRAPE JUICE",
      label: "그레이프 주스",
      accent: "#9c27b0",
      bg1: "#f3e5f5",
      bg2: "#e1bee7",
    },
    {
      id: "cyan",
      name: "CYAN LINK",
      label: "시안 링크",
      accent: "#52ded3",
      bg1: "#081c21",
      bg2: "#02090d",
    },
    {
      id: "amber",
      name: "AMBER CORE",
      label: "앰버 코어",
      accent: "#ffc367",
      bg1: "#261c12",
      bg2: "#0c0c0b",
    },
    {
      id: "silver",
      name: "SILVER SHELL",
      label: "실버 셸",
      accent: "#51566d",
      bg1: "#eef0f4",
      bg2: "#cdd3df",
    },
    {
      id: "mono",
      name: "GHOST SIGNAL",
      label: "고스트 시그널",
      accent: "#d6dbe3",
      bg1: "#1a1d25",
      bg2: "#080a0d",
    },
  ];
  const palette = (background) => {
    const rgb = [1, 3, 5].map((i) => parseInt(background.slice(i, i + 2), 16));
    const light = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 155;
    return light
      ? {
          light,
          ink: "#202838",
          text: "#354155",
          muted: "#59677d",
          line: "#8e9aae",
          surface: "#d5dce6",
        }
      : {
          light,
          ink: "#e4f1f5",
          text: "#b2c7d1",
          muted: "#7b9ba9",
          line: "#335361",
          surface: "#08141c",
        };
  };
  root.ChamberProfile = { FONTS, THEMES, palette };
  if (typeof module !== "undefined") module.exports = root.ChamberProfile;
})(typeof window !== "undefined" ? window : globalThis);
