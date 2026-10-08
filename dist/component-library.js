/**
 * SNETS 标准元件库
 *
 * 增加元件：复制一个完整条目并修改键名、位号前缀、引脚和 SVG 图形。
 * 删除元件：删除对应条目。已经使用该元件的旧工程将无法再导入。
 * 修改引脚位置：调整 pins 中的 x / y，不会破坏已有连线。
 * 修改引脚 ID：会影响旧工程兼容性，发布前应谨慎处理。
 *
 * 元件字段说明：
 * name      元件库显示名称
 * title     英文或补充说明
 * category  分类：basic（基础）、transistor（晶体管）、device（器件）
 * prefix    新增实例时的位号前缀
 * value     默认型号或默认值
 * pins      引脚 ID、名称与相对元件中心的坐标
 * fields    属性面板字段：[数据键, 标签, 单位]
 * defaults  额外字段的默认值
 * body      以 (0, 0) 为中心绘制的 SVG 内容
 *
 * 分类与顺序：基础（R、L、C、D、源、VDD、GND、PIN）→ 晶体管（NMOS、PMOS）
 * → 器件（反相器、运放、变压器、N 端口）。库中显示顺序即下方条目顺序。
 */
(function (global) {
  "use strict";

  global.SNETS_COMPONENT_LIBRARY = {
    resistor: {
      name: "电阻",
      title: "Resistor",
      category: "basic",
      prefix: "R",
      value: "10k",
      pins: [
        { id: "1", name: "端口 1", x: 0, y: -60 },
        { id: "2", name: "端口 2", x: 0, y: 60 }
      ],
      fields: [["value", "电阻值", "Ω"]],
      defaults: {},
      body: '<path d="M0-60V-32L-9-25 9-15-9-5 9 5-9 15 9 25 0 32V60"/>'
    },

    inductor: {
      name: "电感",
      title: "Spectre inductor",
      category: "basic",
      prefix: "L",
      value: "10n",
      pins: [{ id: "1", name: "端口 1", x: 0, y: -60 }, { id: "2", name: "端口 2", x: 0, y: 60 }],
      fields: [["value", "电感值", "H"]],
      defaults: {},
      body: '<g transform="rotate(90)"><path d="M-60 0H-36C-36-22-12-22-12 0C-12-22 12-22 12 0C12-22 36-22 36 0H60"/></g>'
    },

    capacitor: {
      name: "电容",
      title: "Capacitor",
      category: "basic",
      prefix: "C",
      value: "10f",
      pins: [
        { id: "1", name: "端口 1", x: 0, y: -60 },
        { id: "2", name: "端口 2", x: 0, y: 60 }
      ],
      fields: [["value", "电容值", "F"]],
      defaults: {},
      body: '<path d="M0-60V-7M-24-7H24M-24 7H24M0 7V60"/>'
    },

    diode: {
      name: "二极管",
      title: "Diode",
      category: "basic",
      prefix: "D",
      value: "diode",
      pins: [{ id: "A", name: "阳极", x: 0, y: -60 }, { id: "K", name: "阴极", x: 0, y: 60 }],
      fields: [["value", "型号", ""]],
      defaults: {},
      body: '<g transform="rotate(90)"><path d="M-60 0H-18M18 0H60M-18-28V28L18 0ZM18-28V28"/></g>'
    },

    voltage: {
      name: "电压源",
      title: "DC voltage source",
      category: "basic",
      prefix: "V",
      value: "1.8 V",
      pins: [
        { id: "+", name: "正极", x: 0, y: -60 },
        { id: "-", name: "负极", x: 0, y: 60 }
      ],
      fields: [["value", "电压值", ""]],
      defaults: {},
      body: '<circle cx="0" cy="0" r="27"/><path d="M0-60V-27M0 27V60M-8-10H8M0-18V-2M-8 12H8"/>'
    },

    current: {
      name: "电流源",
      title: "Independent current source",
      category: "basic",
      prefix: "I",
      value: "1mA",
      pins: [{ id: "+", name: "正端", x: 0, y: -60 }, { id: "-", name: "负端", x: 0, y: 60 }],
      fields: [["value", "电流值", ""]],
      defaults: {},
      body: '<circle cx="0" cy="0" r="27"/><path d="M0-60V-27M0 27V60M0 15V-15M-7-6L0-15L7-6"/>'
    },

    vdd: {
      name: "电源 VDD",
      title: "Power supply",
      category: "basic",
      prefix: "P",
      value: "1.8 V",
      pins: [{ id: "V", name: "电源", x: 0, y: 40 }],
      fields: [["value", "电源标注", ""]],
      defaults: {},
      body: '<path d="M0 40V 0M-18 0H18"/>'
    },

    gnd: {
      name: "接地 GND",
      title: "Ground",
      category: "basic",
      prefix: "G",
      value: "GND",
      pins: [{ id: "0", name: "地", x: 0, y: -20 }],
      fields: [],
      defaults: {},
      body: '<path d="M0 -20 V0 M-20 0 H20 M-13 10 H13 M-6 20 H6"/>'
    },

    input: {
      name: "输入端口",
      title: "Input port",
      category: "basic",
      prefix: "IN",
      value: "VIN",
      pins: [{ id: "P", name: "信号", x: 40, y: 0 }],
      fields: [["value", "网络名称", ""]],
      defaults: {},
      body: '<path d="M-25-12H10L25 0 10 12H-25ZM25 0H40"/>'
    },

    output: {
      name: "输出端口",
      title: "Output port",
      category: "basic",
      prefix: "OUT",
      value: "VOUT",
      pins: [{ id: "P", name: "信号", x: -40, y: 0 }],
      fields: [["value", "网络名称", ""]],
      defaults: {},
      body: '<path d="M-40 0H-25M-25-12H10L25 0 10 12H-25Z"/>'
    },

    bidirectional: {
      name: "双向端口",
      title: "Bidirectional I/O port",
      category: "basic",
      prefix: "IO",
      value: "IO",
      pins: [{ id: "P", name: "双向信号", x: 40, y: 0 }],
      fields: [["value", "网络名称", ""]],
      defaults: {},
      body: '<path d="M-25 -12 H10 L25 0 10 12 H-25 ZM25 0 H40"/>'
    },

    port: {
      name: "射频端口 PORT",
      title: "Spectre two-terminal port",
      category: "basic",
      prefix: "PORT",
      value: "50",
      pins: [
        { id: "1", name: "信号端", x: 0, y: -60 },
        { id: "2", name: "参考端", x: 0, y: 60 }
      ],
      fields: [["value", "端口阻抗", "Ω"], ["num", "端口编号", ""]],
      defaults: { num: "1" },
      body: '<path d="M0-60V-30M0 30V60"/><circle cx="0" cy="0" r="30"/><text x="0" y="4" text-anchor="middle" fill="currentColor" stroke="none" font-size="11">PORT</text>'
    },

    nmos: {
      name: "NMOS",
      title: "N 沟道 MOSFET",
      category: "transistor",
      prefix: "M",
      value: "nmos",
      width: 160,
      pins: [
        { id: "D", name: "漏极", x: 0, y: -60 },
        { id: "G", name: "栅极", x: -80, y: 0 },
        { id: "S", name: "源极", x: 0, y: 60 },
        { id: "B", name: "衬底", x: 0, y: 0 }
      ],
      fields: [["w", "沟道宽度", "μm"], ["l", "沟道长度", "μm"]],
      defaults: { w: "2.0", l: "0.18" },
      body: '<g transform="translate(-20 0)"><path d="M-60 0H-12M-12-25V25M2-25V25M2-25H20V-60M2 25H20V60M2 0H20"/><path d="M12 20 L20 25 L12 30"/></g>'
    },

    pmos: {
      name: "PMOS",
      title: "P 沟道 MOSFET",
      category: "transistor",
      prefix: "M",
      value: "pmos",
      width: 160,
      pins: [
        { id: "S", name: "源极", x: 0, y: -60 },
        { id: "G", name: "栅极", x: -80, y: 0 },
        { id: "D", name: "漏极", x: 0, y: 60 },
        { id: "B", name: "衬底", x: 0, y: 0 }
      ],
      fields: [["w", "沟道宽度", "μm"], ["l", "沟道长度", "μm"]],
      defaults: { w: "4.0", l: "0.18" },
      body: '<g transform="translate(-20 0)"><path d="M-60 0H-25M-12-25V25M2-25V25M2-25H20V-60M2 25H20V60M2 0H20"/><circle cx="-19" cy="0" r="6"/><path d="M12 -30 L20 -25 L12 -20"/></g>'
    },

    inverter: {
      name: "标准反相器",
      title: "Standard-cell inverter",
      category: "device",
      prefix: "U",
      value: "INV",
      pins: [
        { id: "A", name: "输入", x: -60, y: 0 },
        { id: "Y", name: "输出", x: 60, y: 0 },
        { id: "VDD", name: "电源", x: 0, y: -60 },
        { id: "VSS", name: "地", x: 0, y: 60 }
      ],
      fields: [["value", "标准单元", ""]],
      defaults: {},
      body: '<path d="M-60 0H-36M-36-38L34 0-36 38ZM46 0H60M0-60V-19M0 19V60"/><circle cx="40" cy="0" r="6"/>'
    },

    opamp: {
      name: "运算放大器",
      title: "Operational amplifier",
      category: "device",
      prefix: "U",
      value: "OPAMP",
      pins: [
        { id: "+", name: "同相输入", x: -60, y: -20 },
        { id: "-", name: "反相输入", x: -60, y: 20 },
        { id: "OUT", name: "输出", x: 60, y: 0 }
      ],
      fields: [["value", "型号", ""]],
      defaults: {},
      body: '<path d="M-35-48L40 0-35 48ZM-60-20H-35M-60 20H-35M40 0H60M-27-20H-15M-21-26V-14M-27 20H-15"/>'
    },

    transformer_ct: {
      name: "中心抽头变压器",
      title: "Six-terminal center-tapped transformer",
      category: "device",
      prefix: "T",
      value: "1:1",
      pins: [
        { id: "P1", name: "初级上端", x: -60, y: -40 },
        { id: "PCT", name: "初级中心抽头", x: -60, y: 0 },
        { id: "P2", name: "初级下端", x: -60, y: 40 },
        { id: "S1", name: "次级上端", x: 60, y: -40 },
        { id: "SCT", name: "次级中心抽头", x: 60, y: 0 },
        { id: "S2", name: "次级下端", x: 60, y: 40 }
      ],
      fields: [["value", "匝数比", ""]],
      defaults: {},
      body: '<path d="M-60-40H-28C-12-40-12-28-28-28C-44-28-44-16-28-16C-12-16-12-4-28-4H-60M-60 0H-28M-28 4C-12 4-12 16-28 16C-44 16-44 28-28 28C-12 28-12 40-28 40H-60M60-40H28C12-40 12-28 28-28C44-28 44-16 28-16C12-16 12-4 28-4H60M60 0H28M28 4C12 4 12 16 28 16C44 16 44 28 28 28C12 28 12 40 28 40H60M-5-48V48M5-48V48"/>'
    },

    nport: {
      name: "N 端口文件",
      title: "Touchstone multi-port block",
      category: "device",
      prefix: "N",
      value: "device.s4p",
      pins: [
        { id: "1", name: "端口 1", x: -60, y: -40 },
        { id: "2", name: "端口 2", x: -60, y: 40 },
        { id: "3", name: "端口 3", x: 60, y: -40 },
        { id: "4", name: "端口 4", x: 60, y: 40 }
      ],
      fields: [["value", "Touchstone 文件", ""], ["z0", "参考阻抗", "Ω"]],
      defaults: { z0: "50" },
      body: '<rect x="-38" y="-60" width="76" height="120" rx="3"/><path d="M-60-40H-38M-60 40H-38M38-40H60M38 40H60"/><text x="0" y="-4" text-anchor="middle" fill="currentColor" stroke="none" font-size="14">N-PORT</text><text x="0" y="16" text-anchor="middle" fill="currentColor" stroke="none" font-size="10">Touchstone</text>'
    },

    generic: {
      name: "通用器件",
      title: "Imported Spectre device",
      category: "device",
      prefix: "X",
      value: "device",
      pins: [],
      fields: [],
      defaults: {},
      body: '<rect x="-45" y="-50" width="90" height="100" rx="5"/><text x="0" y="4" text-anchor="middle" fill="currentColor" stroke="none" font-size="11">DEVICE</text>'
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
