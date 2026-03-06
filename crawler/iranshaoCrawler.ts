/**
 * 爱燃烧（iranshao）爬虫 - 真实数据抓取
 * 
 * 从爱燃烧网站抓取马拉松/跑步赛事数据
 * 用法：cd /opt/marathon_calendar && npx tsx crawler/iranshaoCrawler.ts
 */

import { load } from "cheerio";
import crypto from "crypto";

// ================== 配置 ==================

const IRANSHAO_CONFIG = {
  baseUrl: "https://iranshao.com",
  // 赛事列表页面 - 近期跑步赛事
  eventsPage: "https://iranshao.com/races?status=upcoming",
  timeout: 15000,
  retryMax: 3,
  retryBackoffMs: 1000,
};

// ================== 类型 ==================

interface IranshaoEvent {
  name: string;
  city: string;
  province: string;
  country: string;
  raceDate: string;
  url: string;
  description?: string;
  registrationStatus?: string;
  registrationUrl?: string;
}

// ================== 工具函数 ==================

async function fetchWithRetry(
  url: string,
  options: RequestInit & { timeout: number; retryMax: number; retryBackoffMs: number }
): Promise<string> {
  const { timeout, retryMax, retryBackoffMs, ...fetchOptions } = options;
  
  for (let attempt = 1; attempt <= retryMax; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
        },
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.text();
    } catch (error) {
      if (attempt === retryMax) {
        throw error;
      }
      console.log(`Attempt ${attempt} failed for ${url}, retrying...`);
      await new Promise(resolve => setTimeout(resolve, retryBackoffMs * attempt));
    }
  }
  
  throw new Error("All retries failed");
}

/**
 * 解析日期
 */
function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  // 处理各种日期格式
  const cleaned = dateStr.trim()
    .replace(/年/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '')
    .replace(/\s+/g, ' ');
  
  // 尝试匹配 YYYY-MM-DD 或 YYYY.MM.DD 格式
  const dateMatch = cleaned.match(/(\d{4})[-.](\d{1,2})[-.](\d{1,2})/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return null;
}

/**
 * 判断赛事类型
 */
function getEventType(name: string, description?: string): string {
  const text = `${name} ${description || ''}`.toLowerCase();
  
  if (text.includes('马拉松') || text.includes('marathon')) {
    return '马拉松';
  }
  if (text.includes('半程马拉松') || text.includes('half marathon')) {
    return '半程马拉松';
  }
  if (text.includes('越野') || text.includes('trail') || text.includes('越野赛')) {
    return '越野赛';
  }
  if (text.includes('铁人三项') || text.includes('triathlon')) {
    return '铁人三项';
  }
  if (text.includes('徒步') || text.includes('hiking')) {
    return '徒步';
  }
  
  return '跑步';
}

/**
 * 判断报名状态
 */
function getRegistrationStatus(text: string): string {
  const lower = text.toLowerCase();
  
  if (lower.includes('报名中') || lower.includes('即将开始') || lower.includes('报名') && !lower.includes('截止') && !lower.includes('结束')) {
    return '报名中';
  }
  if (lower.includes('已截止') || lower.includes('报名结束') || lower.includes('报名已满')) {
    return '已截止';
  }
  if (lower.includes('即将') || lower.includes('即将开始')) {
    return '即将开始';
  }
  
  return '待更新';
}

/**
 * 解析省份城市
 */
function parseLocation(cityStr: string): { city: string; province: string } {
  if (!cityStr) {
    return { city: '', province: '' };
  }
  
  const cleaned = cityStr.trim();
  
  // 已知省份列表
  const provinces = [
    '北京', '上海', '天津', '重庆',
    '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西',
    '山东', '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西',
    '甘肃', '青海', '台湾', '内蒙古', '广西', '西藏', '宁夏', '新疆', '香港', '澳门'
  ];
  
  // 尝试匹配省份
  for (const province of provinces) {
    if (cleaned.startsWith(province)) {
      const city = cleaned.slice(province.length).trim();
      return { city: city || province, province };
    }
  }
  
  // 没有省份前缀，直接返回
  return { city: cleaned, province: '' };
}

/**
 * 内容哈希 - 用于变更检测
 */
function contentHash(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

// ================== 爬虫核心 ==================

/**
 * 抓取爱燃烧赛事列表
 */
async function crawlIranshaoEvents(): Promise<IranshaoEvent[]> {
  const events: IranshaoEvent[] = [];
  
  console.log(`正在抓取爱燃烧赛事数据...`);
  
  try {
    // 尝试抓取赛事列表页面
    const html = await fetchWithRetry(IRANSHAO_CONFIG.eventsPage, {
      timeout: IRANSHAO_CONFIG.timeout,
      retryMax: IRANSHAO_CONFIG.retryMax,
      retryBackoffMs: IRANSHAO_CONFIG.retryBackoffMs,
    });
    
    const $ = load(html);
    
    // 爱燃烧页面结构 - 可能需要根据实际结构调整
    // 尝试多种选择器
    const eventSelectors = [
      '.race-list .race-item',
      '.races-list .race-item',
      '.event-item',
      'article.race',
      '.race-card',
      '[class*="race-item"]',
      '.card-race',
    ];
    
    let foundEvents = false;
    
    for (const selector of eventSelectors) {
      const $events = $(selector);
      
      if ($events.length > 0) {
        foundEvents = true;
        console.log(`使用选择器 "${selector}" 找到 ${$events.length} 个赛事`);
        
        $events.each((_, el) => {
          const $el = $(el);
          
          // 提取赛事名称
          const name = $el.find('h3, h2, .title, .name, [class*="title"], [class*="name"]').first().text().trim();
          
          // 提取赛事日期
          const dateText = $el.find('.date, .time, [class*="date"], [class*="time"]').first().text().trim();
          const raceDate = parseDate(dateText);
          
          // 提取城市/地点
          const locationText = $el.find('.city, .location, [class*="city"], [class*="location"]').first().text().trim();
          const { city, province } = parseLocation(locationText);
          
          // 提取链接
          const link = $el.find('a[href*="/races/"], a[href*="/race/"]').first();
          const url = link.attr('href');
          const fullUrl = url ? (url.startsWith('http') ? url : `${IRANSHAO_CONFIG.baseUrl}${url}`) : '';
          
          // 提取报名状态
          const statusText = $el.find('.status, .register-status, [class*="status"]').first().text().trim();
          const registrationStatus = getRegistrationStatus(statusText);
          
          // 提取报名链接
          const registerLink = $el.find('a[href*="register"], a.btn-register, .register-link').first();
          const registrationUrl = registerLink.attr('href') || '';
          
          if (name) {
            events.push({
              name,
              city,
              province,
              country: 'China',
              raceDate: raceDate || '',
              url: fullUrl,
              registrationStatus,
              registrationUrl,
            });
          }
        });
        
        break;
      }
    }
    
    if (!foundEvents) {
      console.log('页面结构未匹配，尝试备用方案...');
      // 备用：尝试从页面中提取所有链接
      $('a[href*="/races/"]').each((_, el) => {
        const $el = $(el);
        const href = $el.attr('href');
        const text = $el.text().trim();
        
        if (text && href && text.length > 2 && text.length < 100) {
          // 可能是赛事名称
          const fullUrl = href.startsWith('http') ? href : `${IRANSHAO_CONFIG.baseUrl}${href}`;
          
          events.push({
            name: text,
            city: '',
            province: '',
            country: 'China',
            raceDate: '',
            url: fullUrl,
            registrationStatus: '待更新',
          });
        }
      });
    }
    
  } catch (error) {
    console.error(`抓取爱燃烧赛事失败:`, error);
  }
  
  return events;
}

/**
 * 抓取单个赛事的详细信息
 */
async function crawlIranshaoEventDetail(url: string): Promise<Partial<IranshaoEvent>> {
  try {
    const html = await fetchWithRetry(url, {
      timeout: IRANSHAO_CONFIG.timeout,
      retryMax: IRANSHAO_CONFIG.retryMax,
      retryBackoffMs: IRANSHAO_CONFIG.retryBackoffMs,
    });
    
    const $ = load(html);
    
    // 提取详细信息
    const description = $('meta[name="description"]').attr('content') || 
                       $('.description, .content, [class*="description"]').first().text().trim();
    
    return {
      description,
    };
  } catch (error) {
    console.error(`抓取赛事详情失败 ${url}:`, error);
    return {};
  }
}

// ================== 主函数 ==================

async function main() {
  console.log('='.repeat(50));
  console.log('爱燃烧（iranshao）马拉松赛事爬虫');
  console.log('='.repeat(50));
  
  const events = await crawlIranshaoEvents();
  
  console.log(`\n共抓取到 ${events.length} 个赛事`);
  
  // 打印前10个赛事
  console.log('\n前10个赛事预览:');
  events.slice(0, 10).forEach((event, index) => {
    console.log(`${index + 1}. ${event.name}`);
    console.log(`   城市: ${event.city || event.province || '未知'}`);
    console.log(`   日期: ${event.raceDate || '待定'}`);
    console.log(`   状态: ${event.registrationStatus}`);
    console.log(`   URL: ${event.url}`);
    console.log('');
  });
  
  // 保存到文件
  const fs = await import('fs');
  const outputPath = '/opt/marathon_calendar/crawler/data/iranshao_events.json';
  
  // 确保目录存在
  const dir = '/opt/marathon_calendar/crawler/data';
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(events, null, 2), 'utf-8');
  console.log(`数据已保存到: ${outputPath}`);
  
  return events;
}

// 允许直接运行
if (require.main === module) {
  main().catch(console.error);
}

export { crawlIranshaoEvents, IranshaoEvent };
