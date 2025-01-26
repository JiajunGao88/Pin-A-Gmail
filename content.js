// 存储已置顶邮件的ID
let pinnedEmails = new Set();
let isProcessing = false;

// 添加一个Map来存储邮件的原始位置
let originalPositions = new Map();

// 初始化插件
async function initializePlugin() {
  try {
    // 从存储中加载置顶邮件
    const result = await chrome.storage.sync.get(['pinnedEmails']);
    if (result.pinnedEmails) {
      pinnedEmails = new Set(result.pinnedEmails);
    }

    // 等待Gmail界面加载完成
    await waitForGmailToLoad();
    
    // 开始观察DOM变化
    observeGmailChanges();
    
    // 初始处理当前可见的邮件
    processEmails();
  } catch (error) {
    console.error('Gmail Pin Extension initialization error:', error);
    // 添加错误重试机制
    setTimeout(initializePlugin, 5000);
  }
}

// 修改等待Gmail加载完成的函数，添加更多详细的检查
function waitForGmailToLoad() {
    return new Promise((resolve) => {
      const checkGmail = setInterval(() => {
        // 检查多个可能的选择器
        const emailList = document.querySelector('.AO') || // 主列表容器
                         document.querySelector('div[role="main"]') || // 主要内容区域
                         document.querySelector('.aeF'); // 邮件列表容器
        
        if (emailList) {
          console.log('Gmail interface detected');
          clearInterval(checkGmail);
          resolve();
        }
      }, 1000);
    });
  }
  
  // 修改观察Gmail界面变化的函数
  function observeGmailChanges() {
    const observer = new MutationObserver(debounce(() => {
      if (!isProcessing) {
        console.log('Mutation observed, processing emails');
        processEmails();
      }
    }, 500));
  
    // 观察整个Gmail主容器
    const gmailContainer = document.querySelector('.AO') || 
                          document.querySelector('div[role="main"]') ||
                          document.querySelector('.aeF');
                          
    if (gmailContainer) {
      console.log('Setting up observer');
      observer.observe(gmailContainer, {
        childList: true,
        subtree: true
      });
    }
  }
  
  // 修改处理邮件列表的函数
  function processEmails() {
    if (isProcessing) return;
    isProcessing = true;
  
    try {
      const emailContainer = document.querySelector('table[role="grid"] tbody');
      const emailRows = emailContainer.querySelectorAll('tr.zA');
      
      // 保存所有邮件的原始位置
      emailRows.forEach((emailRow, index) => {
        const emailId = getEmailId(emailRow);
        if (!originalPositions.has(emailId)) {
          originalPositions.set(emailId, {
            index: index,
            timestamp: getEmailTimestamp(emailRow)
          });
        }
      });

      // 处理置顶按钮和样式
      emailRows.forEach(emailRow => {
        if (!emailRow.querySelector('.pin-button')) {
          addPinButton(emailRow);
        }
        
        const emailId = getEmailId(emailRow);
        if (pinnedEmails.has(emailId)) {
          emailRow.classList.add('pinned-email');
        } else {
          emailRow.classList.remove('pinned-email');
        }
      });
      
      // 只在有置顶邮件时进行重排序
      if (pinnedEmails.size > 0) {
        reorderPinnedEmails();
      }
    } catch (error) {
      console.error('Process emails error:', error);
    } finally {
      isProcessing = false;
    }
  }
  
  // 修改添加置顶按钮的函数
  function addPinButton(emailRow) {
    // 检查是否已经有按钮
    if (emailRow.querySelector('.pin-button')) return;
  
    const pinButton = document.createElement('button');
    pinButton.className = 'pin-button';
    pinButton.innerHTML = '📌';
    pinButton.title = 'Pin/Unpin';
    
    const emailId = getEmailId(emailRow);
    if (emailId && pinnedEmails.has(emailId)) {
      emailRow.classList.add('pinned-email');
    }
    
    pinButton.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePin(emailRow);
    });
    
    // 查找邮件预览内容的单元格（通常是第三个或第四个单元格）
    const subjectCell = emailRow.querySelector('td[role="gridcell"]:nth-child(6)');

    if (subjectCell) {
      // 在预览内容开头插入按钮
      const firstChild = subjectCell.firstChild;
      subjectCell.insertBefore(pinButton, firstChild);
    }
  }
  
  // 修改获取邮件ID的函数
  function getEmailId(emailRow) {
    return emailRow.getAttribute('data-legacy-thread-id') || 
           emailRow.getAttribute('data-thread-id') ||
           emailRow.id;
  }

// 修改重新排序置顶邮件的函数
function reorderPinnedEmails() {
  const emailContainer = document.querySelector('table[role="grid"] tbody');
  if (!emailContainer) return;

  try {
    // 获取所有邮件行
    const allRows = Array.from(emailContainer.querySelectorAll('tr.zA'));
    if (allRows.length === 0) return;

    // 创建一个Map来存储邮件行和它们的时间戳
    const rowTimestamps = new Map();

    // 预先计算所有置顶邮件的时间戳
    const pinnedRows = allRows.filter(row => pinnedEmails.has(getEmailId(row)));
    pinnedRows.forEach(row => {
      rowTimestamps.set(row, getEmailTimestamp(row));
    });

    // 按时间戳排序
    const sortedPinnedRows = pinnedRows.sort((a, b) => {
      const timeA = rowTimestamps.get(a);
      const timeB = rowTimestamps.get(b);
      if (timeA === timeB) {
        // 如果时间戳相同，保持原始顺序
        return allRows.indexOf(a) - allRows.indexOf(b);
      }
      return timeB - timeA; // 降序排列
    });

    // 将排序后的置顶邮件移动到顶部
    sortedPinnedRows.forEach((row, index) => {
      emailContainer.insertBefore(row, emailContainer.children[index]);
    });

  } catch (error) {
    console.error('Error reordering pinned emails:', error);
  }
}

// 新增：获取邮件时间戳的函数
function getEmailTimestamp(emailRow) {
  try {

    // 遍历所有可能包含时间信息的元素
    const timeElements = emailRow.querySelectorAll('td[role="gridcell"] *');
    for (const element of timeElements) {
      // 检查datetime属性
      const datetime = element.getAttribute('datetime');
      if (datetime) {
        const timestamp = new Date(datetime).getTime();
        if (!isNaN(timestamp)) {
          return timestamp;
        }
      }

      // 检查title属性
      const title = element.getAttribute('title');
      if (title) {
        const timestamp = new Date(title).getTime();
        if (!isNaN(timestamp)) {
          return timestamp;
        }
      }

      // 检查aria-label属性
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) {
        const timestamp = new Date(ariaLabel).getTime();
        if (!isNaN(timestamp)) {
          return timestamp;
        }
      }
    }

  } catch (error) {
    console.error('Error getting email timestamp:', error);
    // 发生错误时返回当前时间，确保不会影响其他邮件的排序
    return Date.now();
  }
}

// 新增：解析Gmail时间文本的函数
function parseGmailTimeText(text) {
  const now = new Date();
  const timeText = text.trim();
  
  // 如果是ISO格式的日期时间，直接返回
  const isoTimestamp = Date.parse(timeText);
  if (!isNaN(isoTimestamp)) {
    return isoTimestamp;
  }

  // 通用时间模式匹配（支持24小时制和12小时制）
  const timePattern = /(\d{1,2}):(\d{2})/;
  const timeMatch = timeText.match(timePattern);
  if (timeMatch) {
    const time = new Date();
    let [hours, minutes] = timeMatch.slice(1).map(Number);
    
    // 处理AM/PM格式（支持多语言）
    const isAM = /AM|上午|早上|오전|午前/i.test(timeText);
    const isPM = /PM|下午|晚上|오후|午後/i.test(timeText);
    
    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;
    
    time.setHours(hours, minutes);
    return time.getTime();
  }

  // 处理日期格式
  // 匹配常见的日期模式：MM/DD, DD/MM, MM月DD日, DD-MM, etc.
  const datePattern = /(\d{1,2})[\/\-月\.日\s]+(\d{1,2})/;
  const dateMatch = timeText.match(datePattern);
  if (dateMatch) {
    let [_, num1, num2] = dateMatch;
    [num1, num2] = [num1, num2].map(Number);
    
    // 根据地区设置判断月份和日期的顺序
    const userLang = navigator.language || navigator.userLanguage;
    const isMonthFirst = /^en-US|ja|ko/.test(userLang);
    
    const month = isMonthFirst ? num1 - 1 : num2 - 1;
    const day = isMonthFirst ? num2 : num1;
    
    const date = new Date(now.getFullYear(), month, day);
    
    // 如果日期超前于现在，可能是去年的日期
    if (date > now) {
      date.setFullYear(date.getFullYear() - 1);
    }
    
    return date.getTime();
  }

  // 处理相对时间表达
  const relativeTimePatterns = {
    // 添加多语言支持的相对时间匹配
    minutes: /(\d+)\s*(minutes?|分钟|分|분)/i,
    hours: /(\d+)\s*(hours?|小时|時間|시간)/i,
    days: /(\d+)\s*(days?|天|日|일)/i,
    weeks: /(\d+)\s*(weeks?|周|週間|주)/i,
    months: /(\d+)\s*(months?|个月|ヶ月|개월)/i
  };

  for (const [unit, pattern] of Object.entries(relativeTimePatterns)) {
    const match = timeText.match(pattern);
    if (match) {
      const value = parseInt(match[1]);
      const time = new Date();
      switch(unit) {
        case 'minutes': time.setMinutes(time.getMinutes() - value); break;
        case 'hours': time.setHours(time.getHours() - value); break;
        case 'days': time.setDate(time.getDate() - value); break;
        case 'weeks': time.setDate(time.getDate() - (value * 7)); break;
        case 'months': time.setMonth(time.getMonth() - value); break;
      }
      return time.getTime();
    }
  }

  // 如果无法解析，返回当前时间
  console.warn('Unable to parse time text:', timeText);
  return now.getTime();
}

// 修改切换置顶状态的函数
async function togglePin(emailRow) {
  const emailId = getEmailId(emailRow);
  
  try {
    if (pinnedEmails.has(emailId)) {
      // 取消置顶
      pinnedEmails.delete(emailId);
      
      // 保存状态
      await chrome.storage.sync.set({
        pinnedEmails: Array.from(pinnedEmails)
      });

      // 获取原始位置信息
      const originalInfo = originalPositions.get(emailId);
      if (originalInfo) {
        const emailContainer = document.querySelector('table[role="grid"] tbody');
        const allRows = Array.from(emailContainer.querySelectorAll('tr.zA'));
        
        // 找到正确的目标位置
        let targetPosition = findTargetPosition(originalInfo.timestamp, allRows);
        
        // 移动到目标位置
        if (targetPosition >= allRows.length) {
          emailContainer.appendChild(emailRow);
        } else {
          emailContainer.insertBefore(emailRow, allRows[targetPosition]);
        }
      }
      
      // 移除置顶样式
      emailRow.classList.remove('pinned-email');
      
    } else {
      // 添加置顶
      pinnedEmails.add(emailId);
      emailRow.classList.add('pinned-email');
      
      // 保存状态
      await chrome.storage.sync.set({
        pinnedEmails: Array.from(pinnedEmails)
      });
      
      // 重新排序置顶区域
      reorderPinnedEmails();
    }
  } catch (error) {
    console.error('Toggle pin error:', error);
  }
}

// 新增：根据时间戳找到正确的目标位置
function findTargetPosition(timestamp, allRows) {
  // 跳过置顶区域
  const firstNonPinnedIndex = allRows.findIndex(row => !pinnedEmails.has(getEmailId(row)));
  
  // 在非置顶区域找到合适的位置
  for (let i = firstNonPinnedIndex; i < allRows.length; i++) {
    const currentRow = allRows[i];
    const currentTimestamp = getEmailTimestamp(currentRow);
    
    if (timestamp > currentTimestamp) {
      return i;
    }
  }
  
  return allRows.length;
}

// 添加新的函数来处理 Gmail 刷新
function triggerGmailRefresh() {
  const refreshButton = document.querySelector('div[aria-label="刷新"]') || 
                       document.querySelector('div[aria-label="Refresh"]') ||
                       document.querySelector('div[jsaction*="refresh"]');
  
  if (refreshButton) {
    refreshButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    refreshButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return;
  }

  // 如果找不到刷新按钮，尝试通过URL参数刷新
  const currentUrl = window.location.href;
  if (currentUrl.includes('?')) {
    // 如果URL已经有参数，添加一个时间戳
    window.location.href = currentUrl + '&refresh=' + Date.now();
  } else {
    window.location.href = currentUrl + '?refresh=' + Date.now();
  }
}

// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 启动插件
initializePlugin();