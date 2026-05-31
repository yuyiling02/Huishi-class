import os

def replace_in_file(file_path, replacements):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    for old_str, new_str in replacements:
        content = content.replace(old_str, new_str)
        
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

replacements = [
    # 1. Global background
    (
        '<div className="flex flex-col h-screen text-slate-700">',
        '<div className="flex flex-col h-screen text-white/90 bg-[#0c0c0c] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#0c0c0c] via-[#0c0c0c] to-[#05070a]">'
    ),
    # 2. Navbar Brand
    (
        '<span className="text-xl font-black text-gray-700 tracking-tight">慧视课堂</span>\n            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">AI 沉浸式教学系统</span>',
        '<span className="text-xl font-black text-white tracking-widest">慧视课堂</span>\n            <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">AI 沉浸式教学系统</span>'
    ),
    # 3. Image to 3D Button
    (
        '<button className="px-6 py-2 rounded-full glass-panel text-gray-600 hover:bg-white flex items-center transition-all hover:scale-105 active:scale-95 shadow-sm">\n              <Sparkles className="mr-2 text-[#86e3ce]" size={18} /> 图片转 3D\n            </button>',
        '<button className="px-6 py-2 rounded-full bg-white/5 border border-white/10 text-white/80 hover:bg-[#00d2ff]/10 hover:text-[#00d2ff] hover:shadow-[0_0_15px_rgba(0,210,255,0.2)] flex items-center transition-all hover:scale-105 active:scale-95 shadow-sm">\n              <Sparkles className="mr-2 text-[#00d2ff]" size={18} /> 图片转 3D\n            </button>'
    ),
    # 4. Import Model Button
    (
        '<button className="px-6 py-2 rounded-full glass-panel text-orange-400 hover:text-orange-600 flex items-center transition-all hover:bg-orange-50">\n              <Download className="mr-2 text-orange-300" size={18} /> 导入模型\n            </button>',
        '<button className="px-6 py-2 rounded-full bg-white/5 border border-white/10 text-orange-400/80 hover:bg-orange-500/10 hover:text-orange-400 hover:shadow-[0_0_15px_rgba(251,146,60,0.2)] flex items-center transition-all">\n              <Download className="mr-2 text-orange-400/80" size={18} /> 导入模型\n            </button>'
    ),
    # 5. AI Avatar
    (
        '<div className="w-11 h-11 rounded-full border-4 border-white shadow-md overflow-hidden bg-white">\n            <div className="w-full h-full bg-[#86e3ce] text-white flex items-center justify-center font-black text-sm">AI</div>\n          </div>',
        '<div className="w-11 h-11 rounded-full border-2 border-[#00d2ff]/30 shadow-[0_0_10px_rgba(0,210,255,0.3)] overflow-hidden bg-[#0c0c0c]">\n            <div className="w-full h-full bg-gradient-to-br from-[#00d2ff] to-[#3D81E3] text-white flex items-center justify-center font-black text-sm">AI</div>\n          </div>'
    ),
    # 6. Sidebar Container
    (
        '<aside className={`glass-panel rounded-[32px] flex shrink-0 flex-col animate-in slide-in-from-left-8 duration-700 transition-all ${isSidebarCollapsed ? \'w-20 items-center p-3 overflow-hidden\' : \'w-72 p-6 overflow-y-auto\'}`}>',
        '<aside className={`bg-[#12121a]/60 backdrop-blur-2xl border border-white/5 shadow-2xl rounded-[32px] flex shrink-0 flex-col animate-in slide-in-from-left-8 duration-700 transition-all ${isSidebarCollapsed ? \'w-20 items-center p-3 overflow-hidden\' : \'w-72 p-6 overflow-y-auto\'}`}>'
    ),
    # 7. Stage Container
    (
        '<section ref={stageRef} className={`flex-1 glass-panel relative overflow-hidden group bg-white ${isStageFullscreen ? \'h-screen w-screen rounded-none\' : \'rounded-[32px]\'}`}>',
        '<section ref={stageRef} className={`flex-1 bg-[#0c0c0c]/40 backdrop-blur-sm border border-white/5 relative overflow-hidden group ${isStageFullscreen ? \'h-screen w-screen rounded-none\' : \'rounded-[32px]\'}`}>'
    ),
    # 8. Empty State
    (
        '<div className="w-full h-full flex flex-col items-center justify-center bg-white/20">\n                <div className="relative mb-8">\n                  <div className="absolute inset-0 bg-[#86e3ce]/10 blur-[80px] rounded-full"></div>\n                  <div className="relative w-40 h-40 bg-white/80 rounded-[40px] shadow-xl border border-white flex items-center justify-center">\n                    <Box className="text-[#86e3ce] w-20 h-20 animate-spin-slow" strokeWidth={1} />\n                  </div>\n                </div>\n                <div className="text-center px-8">\n                  <h2 className="text-2xl font-black text-gray-700 mb-2">欢迎来到 3D AI 实验室</h2>\n                  <p className="text-gray-400 text-sm font-medium max-w-[360px] leading-relaxed">',
        '<div className="w-full h-full flex flex-col items-center justify-center bg-transparent">\n                <div className="relative mb-8">\n                  <div className="absolute inset-0 bg-[#00d2ff]/20 blur-[100px] rounded-full"></div>\n                  <div className="relative w-40 h-40 bg-[#1a1a24]/80 backdrop-blur-xl rounded-[40px] shadow-[0_0_30px_rgba(0,210,255,0.15)] border border-white/10 flex items-center justify-center">\n                    <Box className="text-[#00d2ff] w-20 h-20 animate-spin-slow drop-shadow-[0_0_8px_rgba(0,210,255,0.8)]" strokeWidth={1} />\n                  </div>\n                </div>\n                <div className="text-center px-8">\n                  <h2 className="text-2xl font-black text-white/90 mb-2 tracking-wide">欢迎来到 3D AI 实验室</h2>\n                  <p className="text-white/50 text-sm font-medium max-w-[360px] leading-relaxed">'
    ),
    # 9. TextArea
    (
        'className="w-full resize-none rounded-2xl border border-gray-200/70 bg-white/80 px-3 py-2 text-xs font-medium leading-relaxed text-gray-700 outline-none transition focus:border-[#86e3ce] focus:ring-2 focus:ring-[#86e3ce]/20 disabled:opacity-60 h-16"',
        'className="w-full resize-none rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-xs font-medium leading-relaxed text-white/90 outline-none transition focus:border-[#00d2ff] focus:ring-2 focus:ring-[#00d2ff]/20 disabled:opacity-60 h-16"'
    ),
    # 10. Start Button
    (
        '<button\n                    type="button"\n                    disabled={isAgentRunning || !sidebarAgentRequest.trim()}\n                    onClick={() => handleAgentStart(sidebarAgentRequest.trim())}\n                    className="w-full py-2 rounded-xl bg-gray-900 text-white text-xs font-bold shadow-lg transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-1.5"\n                  >',
        '<button\n                    type="button"\n                    disabled={isAgentRunning || !sidebarAgentRequest.trim()}\n                    onClick={() => handleAgentStart(sidebarAgentRequest.trim())}\n                    className="w-full py-2 rounded-xl bg-gradient-to-r from-[#3D81E3] to-[#00d2ff] text-white text-xs font-bold shadow-[0_0_15px_rgba(0,210,255,0.4)] transition hover:shadow-[0_0_25px_rgba(0,210,255,0.6)] disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-1.5"\n                  >'
    ),
    # 11. Agent Roles Cards
    (
        '<div key={role} className={`rounded-xl border p-1.5 ${m.color}`}>\n                          <div className="text-[9px] font-bold truncate">{m.title}</div>\n                          <div className="flex items-center gap-1 mt-0.5">\n                            <span className={`h-1.5 w-1.5 rounded-full ${agentStatuses[role] === \'running\' || agentStatuses[role] === \'thinking\' ? \'animate-pulse bg-current\' : \'bg-current opacity-50\'}`} />\n                            <span className="text-[8px] font-bold opacity-70">{statusMap[agentStatuses[role]]}</span>\n                          </div>\n                        </div>',
        '<div key={role} className={`rounded-xl border border-white/5 bg-[#1a1a24]/80 p-1.5`}>\n                          <div className="text-[9px] font-bold truncate text-white/80">{m.title}</div>\n                          <div className="flex items-center gap-1 mt-0.5">\n                            <span className={`h-1.5 w-1.5 rounded-full ${agentStatuses[role] === \'running\' || agentStatuses[role] === \'thinking\' ? \'animate-pulse bg-[#00d2ff] shadow-[0_0_5px_#00d2ff]\' : \'bg-gray-500 opacity-50\'}`} />\n                            <span className="text-[8px] font-bold text-white/50">{statusMap[agentStatuses[role]]}</span>\n                          </div>\n                        </div>'
    ),
    # 12. Knowledge Explainer
    (
        '                  {(knowledgeContent || isKnowledgeStreaming) && (\n                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-2.5 py-2">\n                      <div className="flex items-center gap-1.5 mb-0.5">\n                        {isKnowledgeStreaming ? (\n                          <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />\n                        ) : (\n                          <ClipboardCheck size={11} className="text-indigo-600" />\n                        )}\n                        <span className="text-[9px] font-bold text-indigo-600">知识讲解</span>\n                      </div>\n                      <p className="text-[10px] font-medium leading-relaxed text-gray-600 line-clamp-3">{knowledgeContent || (isKnowledgeStreaming ? \'正在生成知识讲解...\' : \'\')}</p>\n                    </div>\n                  )}',
        '                  {(knowledgeContent || isKnowledgeStreaming) && (\n                    <div className="rounded-2xl border border-white/10 bg-[#1a1a24]/90 px-2.5 py-2 shadow-[0_0_15px_rgba(0,210,255,0.1)]">\n                      <div className="flex items-center gap-1.5 mb-0.5">\n                        {isKnowledgeStreaming ? (\n                          <div className="w-1.5 h-1.5 bg-[#00d2ff] rounded-full animate-pulse shadow-[0_0_5px_#00d2ff]" />\n                        ) : (\n                          <ClipboardCheck size={11} className="text-[#00d2ff]" />\n                        )}\n                        <span className="text-[9px] font-bold text-[#00d2ff]">知识讲解</span>\n                      </div>\n                      <p className="text-[10px] font-medium leading-relaxed text-white/80 line-clamp-3">{knowledgeContent || (isKnowledgeStreaming ? \'正在生成知识讲解...\' : \'\')}</p>\n                    </div>\n                  )}'
    ),
    # 13. Footer
    (
        '<footer className="h-8 px-10 flex items-center justify-between text-[10px] text-gray-400 uppercase tracking-widest font-bold bg-white/30 backdrop-blur-sm">\n        <span>© 2026 慧视课堂 | 教育 AI 实验室</span>\n      </footer>',
        '<footer className="h-8 px-10 flex items-center justify-between text-[10px] text-white/30 uppercase tracking-widest font-bold bg-black/20 backdrop-blur-sm border-t border-white/5">\n        <span>© 2026 慧视课堂 | 教育 AI 实验室</span>\n      </footer>'
    ),
    # 14. Timeline items
    (
        '                      agentTimeline.map((item) => (\n                        <div key={item.id} className="rounded-xl border border-gray-100 bg-white/70 px-2.5 py-1.5">\n                          <div className="flex items-center justify-between gap-2">\n                            <span className="text-[9px] font-bold text-gray-600 truncate">{item.title}</span>\n                            <span className={`text-[7px] font-black uppercase ${\n                              item.status === \'running\' ? \'text-blue-500\' :\n                              item.status === \'error\' ? \'text-red-500\' :\n                              item.status === \'done\' ? \'text-emerald-500\' : \'text-gray-400\'\n                            }`}>{item.status === \'running\' ? \'运行中\' : item.status === \'error\' ? \'异常\' : item.status === \'done\' ? \'完成\' : \'待命\'}</span>\n                          </div>\n                          <p className="mt-0.5 line-clamp-1 text-[9px] font-medium text-gray-400">{item.detail}</p>\n                        </div>\n                      ))',
        '                      agentTimeline.map((item) => (\n                        <div key={item.id} className="rounded-xl border border-white/5 bg-[#1a1a24]/60 px-2.5 py-1.5">\n                          <div className="flex items-center justify-between gap-2">\n                            <span className="text-[9px] font-bold text-white/90 truncate">{item.title}</span>\n                            <span className={`text-[7px] font-black uppercase ${\n                              item.status === \'running\' ? \'text-[#00d2ff] animate-pulse\' :\n                              item.status === \'error\' ? \'text-red-400\' :\n                              item.status === \'done\' ? \'text-[#3D81E3]\' : \'text-white/30\'\n                            }`}>{item.status === \'running\' ? \'运行中\' : item.status === \'error\' ? \'异常\' : item.status === \'done\' ? \'完成\' : \'待命\'}</span>\n                          </div>\n                          <p className="mt-0.5 line-clamp-1 text-[9px] font-medium text-white/50">{item.detail}</p>\n                        </div>\n                      ))'
    ),
    # 15. Resource Tabs
    (
        '<button\n                      type="button"\n                      onClick={() => {\n                        setSidebarTab(\'resource\');\n                        setIsSidebarCollapsed(false);\n                      }}\n                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${\n                        sidebarTab === \'resource\'\n                          ? \'bg-white text-gray-700 shadow-sm\'\n                          : \'text-gray-400 hover:text-gray-600\'\n                      }`}\n                    >',
        '<button\n                      type="button"\n                      onClick={() => {\n                        setSidebarTab(\'resource\');\n                        setIsSidebarCollapsed(false);\n                      }}\n                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${\n                        sidebarTab === \'resource\'\n                          ? \'bg-white/10 text-white shadow-sm border border-white/10\'\n                          : \'text-white/40 hover:text-white/70\'\n                      }`}\n                    >'
    ),
    (
        '<button\n                      type="button"\n                      onClick={() => {\n                        setSidebarTab(\'agent\');\n                        setIsSidebarCollapsed(false);\n                      }}\n                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${\n                        sidebarTab === \'agent\'\n                          ? \'bg-white text-gray-700 shadow-sm\'\n                          : \'text-gray-400 hover:text-gray-600\'\n                      }`}\n                    >',
        '<button\n                      type="button"\n                      onClick={() => {\n                        setSidebarTab(\'agent\');\n                        setIsSidebarCollapsed(false);\n                      }}\n                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${\n                        sidebarTab === \'agent\'\n                          ? \'bg-white/10 text-white shadow-sm border border-white/10\'\n                          : \'text-white/40 hover:text-white/70\'\n                      }`}\n                    >'
    ),
    # 16. Resource Tab container
    (
        '<div className="flex bg-gray-100/80 rounded-xl p-0.5">',
        '<div className="flex bg-black/40 rounded-xl p-0.5 border border-white/5">'
    ),
    # 17. Chevron buttons
    (
        'bg-white/60 text-gray-400 shadow-sm transition hover:bg-white hover:text-gray-700',
        'bg-white/5 text-white/50 shadow-sm transition hover:bg-white/10 hover:text-white'
    )
]

replace_in_file(r"c:\Users\yuyiling\Desktop\可视化交互\第七版本 展示\Dashboard.tsx", replacements)
print("Updated successfully")
