export interface AdminConfig {
  ConfigSubscribtion: {
    URL: string;
    AutoUpdate: boolean;
    LastCheck: string;
  };
  ConfigFile: string;
  SiteConfig: {
    SiteName: string;
    Announcement: string;
    SearchDownstreamMaxPage: number;
    SiteInterfaceCacheTime: number;
    DoubanProxyType: string;
    DoubanProxy: string;
    DoubanImageProxyType: string;
    DoubanImageProxy: string;
    DisableYellowFilter: boolean;
    FluidSearch: boolean;
    // 登录页面背景图
    LoginBackground?: string;
  };
  UserConfig: {
    Users: {
      username: string;
      role: 'user' | 'admin' | 'owner';
      banned?: boolean;
      enabledApis?: string[]; // 优先级高于tags限制
      tags?: string[]; // 多 tags 取并集限制
    }[];
    Tags?: {
      name: string;
      enabledApis: string[];
    }[];
  };
  SourceConfig: {
    key: string;
    name: string;
    api: string;
    detail?: string;
    from: 'config' | 'custom';
    disabled?: boolean;
    is_adult?: boolean; // 标记是否为成人资源
  }[];
  CustomCategories: {
    name?: string;
    type: 'movie' | 'tv';
    query: string;
    from: 'config' | 'custom';
    disabled?: boolean;
  }[];
  LiveConfig?: {
    key: string;
    name: string;
    url: string; // m3u 地址
    ua?: string;
    epg?: string; // 节目单
    from: 'config' | 'custom';
    channelNumber?: number;
    disabled?: boolean;
  }[];
  DanmuConfig?: {
    enabled: boolean;
    serverUrl: string; // 弹幕 API 服务器地址，如 http://192.168.1.7:9321/87654321
    token: string; // 弹幕 API Token
    platform: string; // 弹幕来源平台优先级，如 'bilibili1,qq,qiyi'
    sourceOrder: string; // 采集源排序，如 '360,vod,renren,hanjutv'
    mergeSourcePairs: string; // 源合并配置
    bilibiliCookie: string; // B站 cookie（选填）
    convertTopBottomToScroll: boolean; // 顶部/底部弹幕转浮动
    convertColor: 'default' | 'white' | 'color'; // 弹幕颜色转换
    danmuLimit: number; // 弹幕数量限制（k）
    blockedWords: string; // 弹幕屏蔽词
    danmuOutputFormat: 'json' | 'xml'; // 输出格式
    simplifiedTraditional: 'default' | 'simplified' | 'traditional'; // 简繁转换
  };
}

export interface AdminConfigResult {
  Role: 'owner' | 'admin';
  Config: AdminConfig;
}
