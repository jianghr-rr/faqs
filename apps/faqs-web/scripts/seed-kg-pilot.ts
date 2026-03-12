import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {eq, and} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
    kgEntities,
    kgEntityAliases,
    kgRelations,
    securities,
    kgEntityTypeEnum,
    kgAliasTypeEnum,
    kgRelationTypeEnum,
} from '~/db/schema';

const cwdEnvPath = resolve(process.cwd(), '.env.local');
const rootEnvPath = resolve(process.cwd(), '../../.env.local');
const loadEnvFile = (process as unknown as {loadEnvFile?: (path: string) => void}).loadEnvFile;

if (loadEnvFile) {
    if (existsSync(rootEnvPath)) {
        loadEnvFile(rootEnvPath);
    }
    if (existsSync(cwdEnvPath)) {
        loadEnvFile(cwdEnvPath);
    }
}

const connectionUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionUrl) {
    throw new Error('Missing DIRECT_URL or DATABASE_URL for seed script');
}

const client = postgres(connectionUrl, {prepare: false});
const db = drizzle(client, {
    schema: {
        kgEntities,
        kgEntityAliases,
        kgRelations,
        securities,
    },
});

type KgEntityType = (typeof kgEntityTypeEnum.enumValues)[number];
type KgAliasType = (typeof kgAliasTypeEnum.enumValues)[number];
type KgRelationType = (typeof kgRelationTypeEnum.enumValues)[number];

type KgSeedBundle = {
    id: string;
    entities: Array<{
        key: string;
        canonicalRef: string;
        entityType: KgEntityType;
        name: string;
        canonicalName: string;
        description?: string;
        metadata?: Record<string, unknown>;
    }>;
    aliases: Array<{
        entityKey: string;
        alias: string;
        aliasType?: KgAliasType;
    }>;
    relations: Array<{
        fromKey: string;
        toKey: string;
        relationType: KgRelationType;
        weight?: string;
        confidence?: string;
        source?: string;
    }>;
    securities: Array<{
        companyKey: string;
        stockCode: string;
        stockName: string;
        exchange: string;
    }>;
};

const storageSeed: KgSeedBundle = {
    id: 'storage',
    entities: [
        {
            key: 'theme_new_energy',
            canonicalRef: 'theme:新能源',
            entityType: 'theme',
            name: '新能源',
            canonicalName: '新能源',
        },
        {
            key: 'industry_energy_storage',
            canonicalRef: 'industry:储能',
            entityType: 'industry',
            name: '储能',
            canonicalName: '储能',
            metadata: {classificationSystem: 'custom_mvp'},
        },
        {
            key: 'chain_battery_cell',
            canonicalRef: 'chain_node:电芯',
            entityType: 'chain_node',
            name: '电芯',
            canonicalName: '电芯',
        },
        {
            key: 'chain_pcs',
            canonicalRef: 'chain_node:PCS',
            entityType: 'chain_node',
            name: 'PCS',
            canonicalName: 'PCS',
        },
        {
            key: 'chain_bms',
            canonicalRef: 'chain_node:BMS',
            entityType: 'chain_node',
            name: 'BMS',
            canonicalName: 'BMS',
        },
        {
            key: 'chain_ems',
            canonicalRef: 'chain_node:EMS',
            entityType: 'chain_node',
            name: 'EMS',
            canonicalName: 'EMS',
        },
        {
            key: 'chain_storage_system',
            canonicalRef: 'chain_node:储能系统',
            entityType: 'chain_node',
            name: '储能系统',
            canonicalName: '储能系统',
        },
        {
            key: 'company_catl',
            canonicalRef: 'company:宁德时代',
            entityType: 'company',
            name: '宁德时代',
            canonicalName: '宁德时代',
            description: '动力电池与储能电池龙头企业',
        },
        {
            key: 'company_sungrow',
            canonicalRef: 'company:阳光电源',
            entityType: 'company',
            name: '阳光电源',
            canonicalName: '阳光电源',
            description: '逆变器与储能 PCS 领域核心公司',
        },
        {
            key: 'company_kehua',
            canonicalRef: 'company:科华数据',
            entityType: 'company',
            name: '科华数据',
            canonicalName: '科华数据',
            description: '储能系统与电力电子相关企业',
        },
    ],
    aliases: [
        {entityKey: 'company_catl', alias: '宁王', aliasType: 'short_name'},
        {entityKey: 'chain_storage_system', alias: '储能集成', aliasType: 'synonym'},
    ],
    relations: [
        {fromKey: 'theme_new_energy', toKey: 'industry_energy_storage', relationType: 'relates_to'},
        {fromKey: 'industry_energy_storage', toKey: 'chain_battery_cell', relationType: 'contains'},
        {fromKey: 'industry_energy_storage', toKey: 'chain_pcs', relationType: 'contains'},
        {fromKey: 'industry_energy_storage', toKey: 'chain_bms', relationType: 'contains'},
        {fromKey: 'industry_energy_storage', toKey: 'chain_ems', relationType: 'contains'},
        {fromKey: 'industry_energy_storage', toKey: 'chain_storage_system', relationType: 'contains'},
        {fromKey: 'chain_battery_cell', toKey: 'chain_storage_system', relationType: 'upstream_of'},
        {fromKey: 'chain_pcs', toKey: 'chain_storage_system', relationType: 'upstream_of'},
        {
            fromKey: 'company_catl',
            toKey: 'chain_battery_cell',
            relationType: 'participates_in',
            weight: '1.0000',
            confidence: '0.9500',
            source: 'manual_seed',
        },
        {
            fromKey: 'company_sungrow',
            toKey: 'chain_pcs',
            relationType: 'participates_in',
            weight: '0.9800',
            confidence: '0.9500',
            source: 'manual_seed',
        },
        {
            fromKey: 'company_kehua',
            toKey: 'chain_storage_system',
            relationType: 'participates_in',
            weight: '0.8600',
            confidence: '0.9000',
            source: 'manual_seed',
        },
        {fromKey: 'company_catl', toKey: 'industry_energy_storage', relationType: 'belongs_to'},
        {fromKey: 'company_sungrow', toKey: 'industry_energy_storage', relationType: 'belongs_to'},
        {fromKey: 'company_kehua', toKey: 'industry_energy_storage', relationType: 'belongs_to'},
    ],
    securities: [
        {companyKey: 'company_catl', stockCode: '300750', stockName: '宁德时代', exchange: 'SZSE'},
        {companyKey: 'company_sungrow', stockCode: '300274', stockName: '阳光电源', exchange: 'SZSE'},
        {companyKey: 'company_kehua', stockCode: '002335', stockName: '科华数据', exchange: 'SZSE'},
    ],
};

const solarSeed: KgSeedBundle = {
    id: 'solar',
    entities: [
        {
            key: 'theme_new_energy',
            canonicalRef: 'theme:新能源',
            entityType: 'theme',
            name: '新能源',
            canonicalName: '新能源',
        },
        {
            key: 'industry_solar',
            canonicalRef: 'industry:光伏',
            entityType: 'industry',
            name: '光伏',
            canonicalName: '光伏',
            metadata: {classificationSystem: 'custom_mvp'},
        },
        {key: 'chain_poly_silicon', canonicalRef: 'chain_node:硅料', entityType: 'chain_node', name: '硅料', canonicalName: '硅料'},
        {key: 'chain_wafer', canonicalRef: 'chain_node:硅片', entityType: 'chain_node', name: '硅片', canonicalName: '硅片'},
        {key: 'chain_cell', canonicalRef: 'chain_node:电池片', entityType: 'chain_node', name: '电池片', canonicalName: '电池片'},
        {key: 'chain_module', canonicalRef: 'chain_node:组件', entityType: 'chain_node', name: '组件', canonicalName: '组件'},
        {key: 'chain_inverter', canonicalRef: 'chain_node:逆变器', entityType: 'chain_node', name: '逆变器', canonicalName: '逆变器'},
        {
            key: 'company_tongwei',
            canonicalRef: 'company:通威股份',
            entityType: 'company',
            name: '通威股份',
            canonicalName: '通威股份',
            description: '硅料与电池片一体化龙头企业',
        },
        {
            key: 'company_longi',
            canonicalRef: 'company:隆基绿能',
            entityType: 'company',
            name: '隆基绿能',
            canonicalName: '隆基绿能',
            description: '硅片与组件一体化龙头企业',
        },
        {
            key: 'company_jinko',
            canonicalRef: 'company:晶科能源',
            entityType: 'company',
            name: '晶科能源',
            canonicalName: '晶科能源',
            description: '全球领先的光伏组件制造商',
        },
        {
            key: 'company_sungrow',
            canonicalRef: 'company:阳光电源',
            entityType: 'company',
            name: '阳光电源',
            canonicalName: '阳光电源',
            description: '逆变器与储能 PCS 领域核心公司',
        },
    ],
    aliases: [
        {entityKey: 'industry_solar', alias: '光伏产业', aliasType: 'synonym'},
        {entityKey: 'industry_solar', alias: 'PV', aliasType: 'english_name'},
        {entityKey: 'chain_poly_silicon', alias: '多晶硅', aliasType: 'synonym'},
    ],
    relations: [
        {fromKey: 'theme_new_energy', toKey: 'industry_solar', relationType: 'relates_to'},
        {fromKey: 'industry_solar', toKey: 'chain_poly_silicon', relationType: 'contains'},
        {fromKey: 'industry_solar', toKey: 'chain_wafer', relationType: 'contains'},
        {fromKey: 'industry_solar', toKey: 'chain_cell', relationType: 'contains'},
        {fromKey: 'industry_solar', toKey: 'chain_module', relationType: 'contains'},
        {fromKey: 'industry_solar', toKey: 'chain_inverter', relationType: 'contains'},
        {fromKey: 'chain_poly_silicon', toKey: 'chain_wafer', relationType: 'upstream_of'},
        {fromKey: 'chain_wafer', toKey: 'chain_cell', relationType: 'upstream_of'},
        {fromKey: 'chain_cell', toKey: 'chain_module', relationType: 'upstream_of'},
        {
            fromKey: 'company_tongwei',
            toKey: 'chain_poly_silicon',
            relationType: 'participates_in',
            weight: '1.0000',
            confidence: '0.9500',
            source: 'manual_seed',
        },
        {
            fromKey: 'company_longi',
            toKey: 'chain_wafer',
            relationType: 'participates_in',
            weight: '0.9500',
            confidence: '0.9500',
            source: 'manual_seed',
        },
        {
            fromKey: 'company_jinko',
            toKey: 'chain_module',
            relationType: 'participates_in',
            weight: '0.9500',
            confidence: '0.9500',
            source: 'manual_seed',
        },
        {
            fromKey: 'company_sungrow',
            toKey: 'chain_inverter',
            relationType: 'participates_in',
            weight: '0.9800',
            confidence: '0.9500',
            source: 'manual_seed',
        },
        {fromKey: 'company_tongwei', toKey: 'industry_solar', relationType: 'belongs_to'},
        {fromKey: 'company_longi', toKey: 'industry_solar', relationType: 'belongs_to'},
        {fromKey: 'company_jinko', toKey: 'industry_solar', relationType: 'belongs_to'},
        {fromKey: 'company_sungrow', toKey: 'industry_solar', relationType: 'belongs_to'},
    ],
    securities: [
        {companyKey: 'company_tongwei', stockCode: '600438', stockName: '通威股份', exchange: 'SSE'},
        {companyKey: 'company_longi', stockCode: '601012', stockName: '隆基绿能', exchange: 'SSE'},
        {companyKey: 'company_jinko', stockCode: '688223', stockName: '晶科能源', exchange: 'SSE'},
        {companyKey: 'company_sungrow', stockCode: '300274', stockName: '阳光电源', exchange: 'SZSE'},
    ],
};

const computeSeed: KgSeedBundle = {
    id: 'compute',
    entities: [
        {
            key: 'theme_ai',
            canonicalRef: 'theme:人工智能',
            entityType: 'theme',
            name: '人工智能',
            canonicalName: '人工智能',
        },
        {
            key: 'industry_compute',
            canonicalRef: 'industry:算力',
            entityType: 'industry',
            name: '算力',
            canonicalName: '算力',
            metadata: {classificationSystem: 'custom_mvp'},
        },
        {key: 'chain_gpu', canonicalRef: 'chain_node:GPU', entityType: 'chain_node', name: 'GPU', canonicalName: 'GPU'},
        {key: 'chain_server', canonicalRef: 'chain_node:服务器', entityType: 'chain_node', name: '服务器', canonicalName: '服务器'},
        {key: 'chain_datacenter', canonicalRef: 'chain_node:数据中心', entityType: 'chain_node', name: '数据中心', canonicalName: '数据中心'},
        {key: 'chain_optical_module', canonicalRef: 'chain_node:光模块', entityType: 'chain_node', name: '光模块', canonicalName: '光模块'},
        {
            key: 'company_inspur',
            canonicalRef: 'company:浪潮信息',
            entityType: 'company',
            name: '浪潮信息',
            canonicalName: '浪潮信息',
            description: 'AI 服务器龙头企业',
        },
        {
            key: 'company_zhongji',
            canonicalRef: 'company:中际旭创',
            entityType: 'company',
            name: '中际旭创',
            canonicalName: '中际旭创',
            description: '全球领先的光模块供应商',
        },
    ],
    aliases: [
        {entityKey: 'theme_ai', alias: 'AI', aliasType: 'english_name'},
        {entityKey: 'theme_ai', alias: 'AIGC', aliasType: 'english_name'},
        {entityKey: 'theme_ai', alias: '大模型', aliasType: 'synonym'},
        {entityKey: 'theme_ai', alias: '生成式AI', aliasType: 'synonym'},
        {entityKey: 'theme_ai', alias: '多模态', aliasType: 'synonym'},
        {entityKey: 'theme_ai', alias: 'OpenAI', aliasType: 'english_name'},
        {entityKey: 'theme_ai', alias: 'ChatGPT', aliasType: 'english_name'},
        {entityKey: 'theme_ai', alias: 'Sora', aliasType: 'english_name'},
        {entityKey: 'theme_ai', alias: 'SORA', aliasType: 'english_name'},
        {entityKey: 'theme_ai', alias: '文生视频', aliasType: 'synonym'},
        {entityKey: 'theme_ai', alias: '视频生成', aliasType: 'synonym'},
        {entityKey: 'industry_compute', alias: 'AI算力', aliasType: 'synonym'},
        {entityKey: 'industry_compute', alias: '算力基础设施', aliasType: 'synonym'},
        {entityKey: 'chain_datacenter', alias: 'IDC', aliasType: 'english_name'},
        {entityKey: 'chain_gpu', alias: '图形处理器', aliasType: 'synonym'},
    ],
    relations: [
        {fromKey: 'theme_ai', toKey: 'industry_compute', relationType: 'relates_to'},
        {fromKey: 'industry_compute', toKey: 'chain_gpu', relationType: 'contains'},
        {fromKey: 'industry_compute', toKey: 'chain_server', relationType: 'contains'},
        {fromKey: 'industry_compute', toKey: 'chain_datacenter', relationType: 'contains'},
        {fromKey: 'industry_compute', toKey: 'chain_optical_module', relationType: 'contains'},
        {fromKey: 'chain_gpu', toKey: 'chain_server', relationType: 'upstream_of'},
        {fromKey: 'chain_server', toKey: 'chain_datacenter', relationType: 'upstream_of'},
        {fromKey: 'chain_optical_module', toKey: 'chain_datacenter', relationType: 'upstream_of'},
        {
            fromKey: 'company_inspur',
            toKey: 'chain_server',
            relationType: 'participates_in',
            weight: '0.9500',
            confidence: '0.9500',
            source: 'manual_seed',
        },
        {
            fromKey: 'company_zhongji',
            toKey: 'chain_optical_module',
            relationType: 'participates_in',
            weight: '1.0000',
            confidence: '0.9500',
            source: 'manual_seed',
        },
        {fromKey: 'company_inspur', toKey: 'industry_compute', relationType: 'belongs_to'},
        {fromKey: 'company_zhongji', toKey: 'industry_compute', relationType: 'belongs_to'},
    ],
    securities: [
        {companyKey: 'company_inspur', stockCode: '000977', stockName: '浪潮信息', exchange: 'SZSE'},
        {companyKey: 'company_zhongji', stockCode: '300308', stockName: '中际旭创', exchange: 'SZSE'},
    ],
};

const satelliteSeed: KgSeedBundle = {
    id: 'satellite',
    entities: [
        {
            key: 'theme_satellite_internet',
            canonicalRef: 'theme:卫星互联网',
            entityType: 'theme',
            name: '卫星互联网',
            canonicalName: '卫星互联网',
        },
        {
            key: 'industry_satellite_comm',
            canonicalRef: 'industry:卫星通信',
            entityType: 'industry',
            name: '卫星通信',
            canonicalName: '卫星通信',
            metadata: {classificationSystem: 'custom_mvp'},
        },
        {
            key: 'industry_consumer_electronics',
            canonicalRef: 'industry:消费电子',
            entityType: 'industry',
            name: '消费电子',
            canonicalName: '消费电子',
            metadata: {classificationSystem: 'custom_mvp'},
        },
        {
            key: 'chain_satellite_service',
            canonicalRef: 'chain_node:卫星通信服务',
            entityType: 'chain_node',
            name: '卫星通信服务',
            canonicalName: '卫星通信服务',
        },
        {
            key: 'chain_satellite_terminal',
            canonicalRef: 'chain_node:卫星终端',
            entityType: 'chain_node',
            name: '卫星终端',
            canonicalName: '卫星终端',
        },
        {
            key: 'chain_d2d_module',
            canonicalRef: 'chain_node:D2D模组',
            entityType: 'chain_node',
            name: 'D2D模组',
            canonicalName: 'D2D模组',
        },
        {
            key: 'chain_mobile_antenna',
            canonicalRef: 'chain_node:手机天线',
            entityType: 'chain_node',
            name: '手机天线',
            canonicalName: '手机天线',
        },
        {
            key: 'chain_rf_frontend',
            canonicalRef: 'chain_node:射频前端',
            entityType: 'chain_node',
            name: '射频前端',
            canonicalName: '射频前端',
        },
        {
            key: 'chain_smartphone_terminal',
            canonicalRef: 'chain_node:智能终端',
            entityType: 'chain_node',
            name: '智能终端',
            canonicalName: '智能终端',
        },
        {
            key: 'company_china_satellite',
            canonicalRef: 'company:中国卫通',
            entityType: 'company',
            name: '中国卫通',
            canonicalName: '中国卫通',
            description: '卫星通信服务核心运营商',
        },
        {
            key: 'company_hollysys',
            canonicalRef: 'company:华力创通',
            entityType: 'company',
            name: '华力创通',
            canonicalName: '华力创通',
            description: '卫星导航与卫星通信终端相关厂商',
        },
        {
            key: 'company_tongyu',
            canonicalRef: 'company:通宇通讯',
            entityType: 'company',
            name: '通宇通讯',
            canonicalName: '通宇通讯',
            description: '通信天线与卫星通信设备相关厂商',
        },
        {
            key: 'company_sunway',
            canonicalRef: 'company:信维通信',
            entityType: 'company',
            name: '信维通信',
            canonicalName: '信维通信',
            description: '移动终端天线和射频器件供应商',
        },
        {
            key: 'company_maxscend',
            canonicalRef: 'company:卓胜微',
            entityType: 'company',
            name: '卓胜微',
            canonicalName: '卓胜微',
            description: '射频前端芯片龙头公司',
        },
    ],
    aliases: [
        {entityKey: 'industry_satellite_comm', alias: '卫星直连', aliasType: 'synonym'},
        {entityKey: 'industry_satellite_comm', alias: '直连卫星', aliasType: 'synonym'},
        {entityKey: 'industry_satellite_comm', alias: 'D2D', aliasType: 'english_name'},
        {entityKey: 'industry_satellite_comm', alias: '手机卫星通信', aliasType: 'synonym'},
        {entityKey: 'chain_d2d_module', alias: '卫星直连模组', aliasType: 'synonym'},
        {entityKey: 'chain_satellite_terminal', alias: '卫星手机终端', aliasType: 'synonym'},
        {entityKey: 'industry_consumer_electronics', alias: '智能手机', aliasType: 'synonym'},
    ],
    relations: [
        {fromKey: 'theme_satellite_internet', toKey: 'industry_satellite_comm', relationType: 'relates_to'},
        {fromKey: 'theme_satellite_internet', toKey: 'industry_consumer_electronics', relationType: 'relates_to'},
        {fromKey: 'industry_satellite_comm', toKey: 'chain_satellite_service', relationType: 'contains'},
        {fromKey: 'industry_satellite_comm', toKey: 'chain_satellite_terminal', relationType: 'contains'},
        {fromKey: 'industry_satellite_comm', toKey: 'chain_d2d_module', relationType: 'contains'},
        {fromKey: 'industry_consumer_electronics', toKey: 'chain_mobile_antenna', relationType: 'contains'},
        {fromKey: 'industry_consumer_electronics', toKey: 'chain_rf_frontend', relationType: 'contains'},
        {fromKey: 'industry_consumer_electronics', toKey: 'chain_smartphone_terminal', relationType: 'contains'},
        {fromKey: 'chain_satellite_service', toKey: 'chain_satellite_terminal', relationType: 'upstream_of'},
        {fromKey: 'chain_d2d_module', toKey: 'chain_satellite_terminal', relationType: 'upstream_of'},
        {fromKey: 'chain_mobile_antenna', toKey: 'chain_smartphone_terminal', relationType: 'upstream_of'},
        {fromKey: 'chain_rf_frontend', toKey: 'chain_smartphone_terminal', relationType: 'upstream_of'},
        {
            fromKey: 'company_china_satellite',
            toKey: 'chain_satellite_service',
            relationType: 'participates_in',
            weight: '1.0000',
            confidence: '0.9500',
            source: 'manual_seed',
        },
        {
            fromKey: 'company_hollysys',
            toKey: 'chain_satellite_terminal',
            relationType: 'participates_in',
            weight: '0.9200',
            confidence: '0.9000',
            source: 'manual_seed',
        },
        {
            fromKey: 'company_hollysys',
            toKey: 'chain_d2d_module',
            relationType: 'participates_in',
            weight: '0.8800',
            confidence: '0.8800',
            source: 'manual_seed',
        },
        {
            fromKey: 'company_tongyu',
            toKey: 'chain_mobile_antenna',
            relationType: 'participates_in',
            weight: '0.8600',
            confidence: '0.8600',
            source: 'manual_seed',
        },
        {
            fromKey: 'company_sunway',
            toKey: 'chain_mobile_antenna',
            relationType: 'participates_in',
            weight: '0.9000',
            confidence: '0.9000',
            source: 'manual_seed',
        },
        {
            fromKey: 'company_sunway',
            toKey: 'chain_rf_frontend',
            relationType: 'participates_in',
            weight: '0.8200',
            confidence: '0.8500',
            source: 'manual_seed',
        },
        {
            fromKey: 'company_maxscend',
            toKey: 'chain_rf_frontend',
            relationType: 'participates_in',
            weight: '0.9800',
            confidence: '0.9500',
            source: 'manual_seed',
        },
        {fromKey: 'company_china_satellite', toKey: 'industry_satellite_comm', relationType: 'belongs_to'},
        {fromKey: 'company_hollysys', toKey: 'industry_satellite_comm', relationType: 'belongs_to'},
        {fromKey: 'company_tongyu', toKey: 'industry_satellite_comm', relationType: 'belongs_to'},
        {fromKey: 'company_tongyu', toKey: 'industry_consumer_electronics', relationType: 'belongs_to'},
        {fromKey: 'company_sunway', toKey: 'industry_consumer_electronics', relationType: 'belongs_to'},
        {fromKey: 'company_maxscend', toKey: 'industry_consumer_electronics', relationType: 'belongs_to'},
    ],
    securities: [
        {companyKey: 'company_china_satellite', stockCode: '601698', stockName: '中国卫通', exchange: 'SSE'},
        {companyKey: 'company_hollysys', stockCode: '300045', stockName: '华力创通', exchange: 'SZSE'},
        {companyKey: 'company_tongyu', stockCode: '002792', stockName: '通宇通讯', exchange: 'SZSE'},
        {companyKey: 'company_sunway', stockCode: '300136', stockName: '信维通信', exchange: 'SZSE'},
        {companyKey: 'company_maxscend', stockCode: '300782', stockName: '卓胜微', exchange: 'SZSE'},
    ],
};

const allBundles = [storageSeed, solarSeed, computeSeed, satelliteSeed];

function scopedKey(bundleId: string, key: string) {
    return `${bundleId}:${key}`;
}

async function upsertEntity(entity: KgSeedBundle['entities'][number]) {
    const existing = await db
        .select({
            id: kgEntities.id,
            entityType: kgEntities.entityType,
            canonicalName: kgEntities.canonicalName,
        })
        .from(kgEntities)
        .where(and(eq(kgEntities.entityType, entity.entityType), eq(kgEntities.canonicalName, entity.canonicalName)))
        .limit(1);

    if (existing[0]) {
        await db
            .update(kgEntities)
            .set({
                name: entity.name,
                description: entity.description,
                metadata: entity.metadata ?? {},
                updatedAt: new Date(),
            })
            .where(eq(kgEntities.id, existing[0].id));

        return existing[0].id;
    }

    const inserted = await db
        .insert(kgEntities)
        .values({
            entityType: entity.entityType,
            name: entity.name,
            canonicalName: entity.canonicalName,
            description: entity.description,
            metadata: entity.metadata ?? {},
        })
        .returning({id: kgEntities.id});

    return inserted[0]!.id;
}

async function main() {
    const keyToEntityId = new Map<string, string>();
    const canonicalRefToEntityId = new Map<string, string>();
    const canonicalRefToType = new Map<string, KgEntityType>();

    for (const bundle of allBundles) {
        for (const entity of bundle.entities) {
            const entityId = await upsertEntity(entity);
            keyToEntityId.set(scopedKey(bundle.id, entity.key), entityId);
            canonicalRefToEntityId.set(entity.canonicalRef, entityId);
            canonicalRefToType.set(entity.canonicalRef, entity.entityType);
        }
    }

    for (const bundle of allBundles) {
        for (const alias of bundle.aliases) {
            const entityId = keyToEntityId.get(scopedKey(bundle.id, alias.entityKey));
            if (!entityId) {
                throw new Error(`Missing entity for alias: ${bundle.id}/${alias.entityKey}`);
            }

            await db
                .insert(kgEntityAliases)
                .values({
                    entityId,
                    alias: alias.alias,
                    aliasType: alias.aliasType ?? 'common',
                })
                .onConflictDoNothing();
        }
    }

    for (const bundle of allBundles) {
        for (const relation of bundle.relations) {
            const fromId = keyToEntityId.get(scopedKey(bundle.id, relation.fromKey));
            const toId = keyToEntityId.get(scopedKey(bundle.id, relation.toKey));
            if (!fromId || !toId) {
                throw new Error(`Missing relation entity: ${bundle.id}/${relation.fromKey} -> ${relation.toKey}`);
            }

            await db
                .insert(kgRelations)
                .values({
                    fromEntityId: fromId,
                    toEntityId: toId,
                    relationType: relation.relationType,
                    weight: relation.weight,
                    confidence: relation.confidence,
                    source: relation.source ?? 'manual_seed',
                })
                .onConflictDoUpdate({
                    target: [kgRelations.fromEntityId, kgRelations.toEntityId, kgRelations.relationType],
                    set: {
                        weight: relation.weight,
                        confidence: relation.confidence,
                        source: relation.source ?? 'manual_seed',
                        updatedAt: new Date(),
                    },
                });
        }
    }

    for (const bundle of allBundles) {
        for (const security of bundle.securities) {
            const companyEntity = bundle.entities.find((entity) => entity.key === security.companyKey);
            if (!companyEntity) {
                throw new Error(`Missing company entity for security: ${bundle.id}/${security.companyKey}`);
            }

            const entityType = canonicalRefToType.get(companyEntity.canonicalRef);
            if (entityType !== 'company') {
                throw new Error(`Security must reference company entity: ${companyEntity.canonicalRef}`);
            }

            const companyId = canonicalRefToEntityId.get(companyEntity.canonicalRef);
            if (!companyId) {
                throw new Error(`Missing company id for security: ${companyEntity.canonicalRef}`);
            }

            await db
                .insert(securities)
                .values({
                    companyEntityId: companyId,
                    stockCode: security.stockCode,
                    stockName: security.stockName,
                    exchange: security.exchange,
                })
                .onConflictDoUpdate({
                    target: [securities.exchange, securities.stockCode],
                    set: {
                        companyEntityId: companyId,
                        stockName: security.stockName,
                        updatedAt: new Date(),
                    },
                });
        }
    }

    console.log('[seed-kg-pilot] seeded bundles:', allBundles.map((bundle) => bundle.id).join(', '));
    console.log('[seed-kg-pilot] unique entities:', canonicalRefToEntityId.size);
}

main()
    .catch((error) => {
        console.error('[seed-kg-pilot] failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await client.end();
        process.exit();
    });
