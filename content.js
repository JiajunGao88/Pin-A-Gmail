// 存储已置顶邮件的ID
let pinnedEmails = new Set();
let isProcessing = false;

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
      const emailRows = document.querySelectorAll('tr.zA');
      emailRows.forEach(emailRow => {
        if (!emailRow.querySelector('.pin-button')) {
          addPinButton(emailRow);
        }
        
        // 确保置顶状态的样式正确
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
    pinButton.title = '置顶/取消置顶';
    
    const emailId = getEmailId(emailRow);
    if (emailId && pinnedEmails.has(emailId)) {
      emailRow.classList.add('pinned-email');
    }
    
    pinButton.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePin(emailRow);
    });
    
    // 查找邮件预览内容的单元格（通常是第三个或第四个单元格）
    const subjectCell = emailRow.querySelector('td[role="gridcell"]:nth-child(6)') || 
                       emailRow.querySelector('.a4W');
                       
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

  // 获取所有邮件行
  const allRows = Array.from(emailContainer.querySelectorAll('tr.zA'));
  if (allRows.length === 0) return;

  // 只处理置顶邮件的移动
  const pinnedRows = allRows.filter(row => pinnedEmails.has(getEmailId(row)));
  
  // 将置顶邮件移动到顶部
  pinnedRows.reverse().forEach(row => {
    if (emailContainer.firstChild) {
      emailContainer.insertBefore(row, emailContainer.firstChild);
    } else {
      emailContainer.appendChild(row);
    }
  });
}

// 修改切换置顶状态的函数
async function togglePin(emailRow) {
  const emailId = getEmailId(emailRow);
  
  try {
    if (pinnedEmails.has(emailId)) {
      // 取消置顶
      pinnedEmails.delete(emailId);
      emailRow.classList.remove('pinned-email');
      
      // 保存状态
      await chrome.storage.sync.set({
        pinnedEmails: Array.from(pinnedEmails)
      });
      
      // 尝试多种方式触发 Gmail 刷新
      triggerGmailRefresh();
    } else {
      // 添加置顶
      pinnedEmails.add(emailId);
      emailRow.classList.add('pinned-email');
      
      // 保存状态
      await chrome.storage.sync.set({
        pinnedEmails: Array.from(pinnedEmails)
      });
      
      // 重新排序
      reorderPinnedEmails();
    }
  } catch (error) {
    console.error('Toggle pin error:', error);
  }
}

// 添加新的函数来处理 Gmail 刷新
function triggerGmailRefresh() {
  const refreshButton = document.querySelector('div[aria-label="刷新"]') || 
                       document.querySelector('div[aria-label="Refresh"]') ||
                       document.querySelector('div[jsaction*="refresh"]');
  
  if (refreshButton) {  // 修复条件判断
    refreshButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    refreshButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  } else {
    const mailList = document.querySelector('.AO');
    if (mailList) {
      mailList.style.opacity = '0.5';
      setTimeout(() => {
        mailList.style.opacity = '1';
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'u',
          code: 'KeyU',
          keyCode: 85,
          which: 85,
          bubbles: true,
          cancelable: true
        }));
      }, 100);
    }
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