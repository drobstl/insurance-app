"use client";

import { useEffect, useRef } from "react";

export default function AgentGuidePage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      const scripts = containerRef.current.querySelectorAll("script");
      scripts.forEach((oldScript) => {
        const newScript = document.createElement("script");
        Array.from(oldScript.attributes).forEach((attr) =>
          newScript.setAttribute(attr.name, attr.value)
        );
        newScript.textContent = oldScript.textContent;
        oldScript.parentNode?.replaceChild(newScript, oldScript);
      });
    }
  }, []);

  return (
    <div
      ref={containerRef}
      dangerouslySetInnerHTML={{
        __html: `
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); min-height: 100vh; padding: 20px; }
        .container { max-width: 1000px; margin: 0 auto; background: white; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden; }
        .owner-admin-btn { position: fixed; bottom: 20px; right: 20px; padding: 12px 20px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; border: none; border-radius: 30px; cursor: pointer; font-size: 0.9em; font-weight: 600; box-shadow: 0 4px 15px rgba(0,0,0,0.3); z-index: 100; transition: all 0.3s ease; }
        .owner-admin-btn:hover { transform: scale(1.05); box-shadow: 0 6px 20px rgba(0,0,0,0.4); }
        .owner-admin-btn.active { background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); }
        .agent-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 1001; }
        .agent-modal.hidden { display: none; }
        .modal-content { background: white; padding: 40px; border-radius: 20px; text-align: center; max-width: 450px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
        .modal-content h2 { color: #1a1a2e; margin-bottom: 10px; font-size: 1.8em; }
        .modal-content p { color: #666; margin-bottom: 25px; }
        .modal-content input[type="text"] { width: 100%; padding: 15px 20px; font-size: 1.1em; border: 2px solid #e9ecef; border-radius: 10px; margin-bottom: 20px; transition: border-color 0.3s; }
        .modal-content input[type="text"]:focus { outline: none; border-color: #667eea; }
        .modal-content button { width: 100%; padding: 15px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 10px; font-size: 1.1em; font-weight: 600; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }
        .modal-content button:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4); }
        .modal-emoji { font-size: 4em; margin-bottom: 20px; }
        .agent-bar { background: linear-gradient(135deg, #667eea 0%, #5a5fbd 100%); color: white; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; font-size: 0.95em; }
        .agent-bar .agent-name { font-weight: 600; }
        .agent-bar .switch-agent { background: rgba(255,255,255,0.2); border: none; color: white; padding: 6px 15px; border-radius: 20px; cursor: pointer; font-size: 0.85em; transition: background 0.2s; }
        .agent-bar .switch-agent:hover { background: rgba(255,255,255,0.3); }
        .guide-header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 50px 40px; text-align: center; position: relative; }
        .header-branding { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; }
        .agency-logo { width: 180px; height: 180px; border-radius: 20px; object-fit: cover; border: 4px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.1); cursor: pointer; box-shadow: 0 8px 25px rgba(0,0,0,0.2); }
        .logo-placeholder { width: 180px; height: 180px; border-radius: 20px; border: 4px dashed rgba(255,255,255,0.5); display: flex; align-items: center; justify-content: center; font-size: 4em; background: rgba(255,255,255,0.1); cursor: pointer; transition: all 0.3s; }
        .logo-placeholder:hover { background: rgba(255,255,255,0.2); border-color: white; }
        .guide-header h1 { font-size: 2.5em; font-weight: 700; margin-top: 10px; }
        .header-admin-controls { display: none; margin-top: 15px; gap: 10px; justify-content: center; }
        body.admin-mode .header-admin-controls { display: flex; flex-wrap: wrap; }
        .header-admin-controls button { padding: 8px 15px; border: none; border-radius: 8px; cursor: pointer; font-size: 0.85em; font-weight: 500; background: rgba(255,255,255,0.2); color: white; transition: all 0.2s; }
        .header-admin-controls button:hover { background: rgba(255,255,255,0.3); }
        .primary-contact-section { background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%); color: white; padding: 30px; text-align: center; }
        .primary-contact-section .star-badge { display: inline-block; background: #ffc107; color: #1a1a2e; padding: 6px 18px; border-radius: 20px; font-size: 0.85em; font-weight: 700; margin-bottom: 15px; }
        .primary-contact-card { display: flex; align-items: center; justify-content: center; gap: 25px; flex-wrap: wrap; }
        .contact-photo { width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 4px solid #ffc107; background: rgba(255,255,255,0.1); cursor: pointer; }
        .photo-placeholder { width: 120px; height: 120px; border-radius: 50%; border: 4px dashed rgba(255,255,255,0.5); display: flex; align-items: center; justify-content: center; font-size: 3em; background: rgba(255,255,255,0.1); cursor: pointer; transition: all 0.3s; }
        .photo-placeholder:hover { background: rgba(255,255,255,0.2); border-color: #ffc107; }
        .contact-details { text-align: left; }
        .contact-details .contact-name { font-size: 1.8em; font-weight: 700; color: #ffc107; margin-bottom: 10px; }
        .contact-details .contact-info { font-size: 1.1em; line-height: 2; }
        .contact-details a { color: #a5d6a7; text-decoration: none; }
        .contact-details a:hover { text-decoration: underline; }
        .contact-cta { margin-top: 15px; font-style: italic; opacity: 0.9; }
        .contact-admin-controls { display: none; margin-top: 15px; gap: 10px; justify-content: center; }
        body.admin-mode .contact-admin-controls { display: flex; flex-wrap: wrap; }
        .contact-admin-controls button { padding: 8px 15px; border: none; border-radius: 8px; cursor: pointer; font-size: 0.85em; font-weight: 500; background: rgba(255,255,255,0.2); color: white; transition: all 0.2s; }
        .contact-admin-controls button:hover { background: rgba(255,255,255,0.3); }
        .secondary-contacts { background: #f8f9fa; padding: 20px 30px; display: flex; justify-content: center; gap: 30px; flex-wrap: wrap; border-bottom: 1px solid #e9ecef; }
        .secondary-contact { text-align: center; padding: 15px 25px; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .secondary-contact .name { font-weight: 700; color: #1a1a2e; font-size: 1.1em; margin-bottom: 8px; }
        .secondary-contact .info { font-size: 0.9em; color: #555; line-height: 1.8; }
        .secondary-contact a { color: #667eea; text-decoration: none; }
        .secondary-contact a:hover { text-decoration: underline; }
        .guide-main { padding: 30px 40px; }
        .resource-section { margin-bottom: 35px; }
        .resource-section h2 { color: #1a1a2e; font-size: 1.4em; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 3px solid #667eea; display: flex; align-items: center; gap: 10px; }
        .resource-section h2 .icon { font-size: 1.2em; }
        .resource-list { list-style: none; }
        .resource-item { background: #f8f9fa; border-radius: 12px; padding: 18px 20px; margin-bottom: 12px; border-left: 4px solid #667eea; transition: all 0.3s ease; position: relative; }
        .resource-item:hover { transform: translateX(5px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .drag-handle { display: none; position: absolute; left: -25px; top: 50%; transform: translateY(-50%); cursor: grab; font-size: 1.2em; color: #999; padding: 5px; }
        .drag-handle:active { cursor: grabbing; }
        body.admin-mode .resource-item { margin-left: 30px; }
        body.admin-mode .drag-handle { display: block; }
        .resource-item.dragging { opacity: 0.5; background: #e3f2fd; }
        .resource-item.drag-over { border-top: 3px solid #667eea; }
        .resource-title { font-size: 1.05em; font-weight: 600; color: #333; margin-bottom: 8px; }
        .resource-description { font-size: 0.9em; color: #666; margin-bottom: 10px; line-height: 1.5; }
        .resource-links { display: flex; flex-wrap: wrap; gap: 8px; }
        .resource-links a { display: inline-flex; align-items: center; gap: 5px; padding: 6px 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 20px; font-size: 0.85em; font-weight: 500; transition: all 0.2s ease; }
        .resource-links a:hover { transform: scale(1.05); box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); }
        .resource-links a.secondary { background: #6c757d; }
        .resource-admin-controls { display: none; margin-top: 12px; padding-top: 12px; border-top: 1px dashed #ddd; gap: 10px; }
        body.admin-mode .resource-admin-controls { display: flex; flex-wrap: wrap; }
        .resource-admin-controls button { padding: 6px 12px; border: none; border-radius: 5px; cursor: pointer; font-size: 0.8em; font-weight: 500; transition: all 0.2s; }
        .edit-btn { background: #3498db; color: white; }
        .edit-btn:hover { background: #2980b9; }
        .delete-btn { background: #e74c3c; color: white; }
        .delete-btn:hover { background: #c0392b; }
        .add-resource-btn { display: none; width: 100%; padding: 15px; border: 2px dashed #667eea; background: transparent; color: #667eea; border-radius: 12px; cursor: pointer; font-size: 1em; font-weight: 600; margin-top: 15px; transition: all 0.2s; }
        body.admin-mode .add-resource-btn { display: block; }
        .add-resource-btn:hover { background: #667eea10; }
        .edit-modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 2000; justify-content: center; align-items: center; }
        .edit-modal.show { display: flex; }
        .edit-modal-content { background: white; padding: 30px; border-radius: 15px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; }
        .edit-modal-content h3 { margin-bottom: 20px; color: #1a1a2e; }
        .edit-field { margin-bottom: 15px; }
        .edit-field label { display: block; font-weight: 600; margin-bottom: 5px; color: #333; }
        .edit-field input, .edit-field textarea { width: 100%; padding: 10px; border: 2px solid #e9ecef; border-radius: 8px; font-size: 0.95em; font-family: inherit; }
        .edit-field textarea { min-height: 80px; resize: vertical; }
        .edit-field input:focus, .edit-field textarea:focus { outline: none; border-color: #667eea; }
        .edit-modal-buttons { display: flex; gap: 10px; margin-top: 20px; }
        .edit-modal-buttons button { flex: 1; padding: 12px; border: none; border-radius: 8px; font-size: 1em; font-weight: 600; cursor: pointer; }
        .save-btn { background: #27ae60; color: white; }
        .cancel-btn { background: #e9ecef; color: #333; }
        .image-upload-input { display: none; }
        .getting-started { background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); border-radius: 15px; padding: 25px; margin-bottom: 30px; }
        .getting-started h2 { color: #2e7d32; border-bottom-color: #4caf50; }
        .getting-started .resource-item { border-left-color: #4caf50; background: white; }
        .getting-started .resource-links a { background: linear-gradient(135deg, #43a047 0%, #66bb6a 100%); }
        .training-section { background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); border-radius: 15px; padding: 25px; margin-bottom: 30px; }
        .training-section h2 { color: #e65100; border-bottom-color: #ff9800; }
        .training-section .resource-item { border-left-color: #ff9800; background: white; }
        .training-section .resource-links a { background: linear-gradient(135deg, #ff5722 0%, #ff9800 100%); }
        .audio-section { background: linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%); border-radius: 15px; padding: 25px; margin-bottom: 30px; }
        .audio-section h2 { color: #7b1fa2; border-bottom-color: #9c27b0; }
        .audio-section .resource-item { border-left-color: #9c27b0; background: white; }
        .audio-section .resource-links a { background: linear-gradient(135deg, #8e24aa 0%, #ba68c8 100%); }
        .video-section { background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%); border-radius: 15px; padding: 25px; margin-bottom: 30px; }
        .video-section h2 { color: #c62828; border-bottom-color: #f44336; }
        .video-section .resource-item { border-left-color: #f44336; background: white; }
        .video-section .resource-links a { background: linear-gradient(135deg, #e53935 0%, #ef5350 100%); }
        .tools-section { background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); border-radius: 15px; padding: 25px; margin-bottom: 30px; }
        .tools-section h2 { color: #1565c0; border-bottom-color: #2196f3; }
        .tools-section .resource-item { border-left-color: #2196f3; background: white; }
        .tools-section .resource-links a { background: linear-gradient(135deg, #1976d2 0%, #42a5f5 100%); }
        .guide-footer { background: #1a1a2e; color: white; text-align: center; padding: 25px; font-size: 0.9em; }
        @media (max-width: 600px) { .guide-header, .guide-main { padding: 20px; } .guide-header h1 { font-size: 1.6em; } .primary-contact-card { flex-direction: column; text-align: center; } .contact-details { text-align: center; } .secondary-contacts { flex-direction: column; align-items: center; } .owner-admin-btn { bottom: 10px; right: 10px; padding: 10px 15px; font-size: 0.8em; } }
        @media print { body { background: white; padding: 0; } .container { box-shadow: none; } .owner-admin-btn, .resource-admin-controls, .add-resource-btn, .header-admin-controls, .contact-admin-controls, .agent-bar, .drag-handle { display: none !important; } }
    </style>

    <button class="owner-admin-btn" id="adminBtn" onclick="toggleAdminMode()">🔧 Owner Mode</button>
    <input type="file" id="logoUpload" class="image-upload-input" accept="image/*" onchange="handleLogoUpload(event)">
    <input type="file" id="photoUpload" class="image-upload-input" accept="image/*" onchange="handlePhotoUpload(event)">

    <div class="edit-modal" id="editModal">
        <div class="edit-modal-content">
            <h3 id="editModalTitle">Edit Resource</h3>
            <div id="editModalFields"></div>
            <div class="edit-modal-buttons">
                <button class="cancel-btn" onclick="closeEditModal()">Cancel</button>
                <button class="save-btn" onclick="saveEdits()">Save Changes</button>
            </div>
        </div>
    </div>


    <div class="container">

        <header class="guide-header">
            <div class="header-branding">
                <div class="logo-placeholder" id="agencyLogo" onclick="uploadLogo()">🏢</div>
            </div>
            <div class="header-admin-controls">
                <button onclick="uploadLogo()">📷 Change Logo</button>
            </div>
        </header>

        <div class="primary-contact-section">
            <div class="star-badge">⭐ YOUR PRIMARY CONTACT</div>
            <div class="primary-contact-card">
                <div class="photo-placeholder" id="contactPhoto" onclick="uploadPhoto()">👤</div>
                <div class="contact-details" id="primaryContactDetails">
                    <div class="contact-name">Daniel Roberts</div>
                    <div class="contact-info">📞 <a href="tel:314-363-4922">314-363-4922</a><br>✉️ <a href="mailto:RobertsFamilyAgency@gmail.com">RobertsFamilyAgency@gmail.com</a></div>
                    <div class="contact-cta">Questions about ANYTHING? Text or call Daniel first!</div>
                </div>
            </div>
            <div class="contact-admin-controls">
                <button onclick="uploadPhoto()">📷 Change Photo</button>
                <button onclick="editPrimaryContact()">✏️ Edit Contact Info</button>
            </div>
        </div>

        <div class="secondary-contacts" id="secondaryContacts">
            <div class="secondary-contact" data-contact-id="donelle">
                <div class="name">Donelle Roberts</div>
                <div class="info">📞 <a href="tel:314-712-1313">314-712-1313</a><br>✉️ <a href="mailto:DonelleRobertsAgency@gmail.com">DonelleRobertsAgency@gmail.com</a></div>
            </div>
            <div class="secondary-contact" data-contact-id="david">
                <div class="name">David Roberts</div>
                <div class="info">📞 <a href="tel:314-910-7474">314-910-7474</a><br>✉️ <a href="mailto:DRobertsAgency@gmail.com">DRobertsAgency@gmail.com</a></div>
            </div>
        </div>

        <main class="guide-main">
            <div class="resource-section getting-started" data-section-id="getting-started">
                <h2><span class="icon">🚀</span> Getting Started</h2>
                <ul class="resource-list">
                    <li class="resource-item" data-resource-id="res-license" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Obtain your State Insurance License</div><div class="resource-description">Skip if you already have your license. Contact Daniel if you need guidance on getting licensed.</div><div class="resource-links"><a href="https://nipr.com/" target="_blank">NIPR - National Insurance Producer Registry</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-eo" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Get E&O (Errors & Omissions) Insurance</div><div class="resource-description">Required before you can write business.</div><div class="resource-links"><a href="https://calsurance.com/sfglife" target="_blank">Get E&O Insurance</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-1" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Create Business Gmail Account</div><div class="resource-description">Example: DonelleRobertsAgency@gmail.com - Use a professional format for your work email.</div><div class="resource-links"><a href="https://accounts.google.com/signup" target="_blank">Create Gmail Account</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-2" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Join BAND Group</div><div class="resource-description">Use your first and last name, and add a profile pic. Also download the app on your phone.</div><div class="resource-links"><a href="https://band.us/home" target="_blank">Join BAND</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-3" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Join WhatsApp Group</div><div class="resource-description">Connect with the team on WhatsApp for quick communication.</div><div class="resource-links"><a href="https://chat.whatsapp.com/" target="_blank">Join WhatsApp</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-4" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Notify Daniel You've Joined</div><div class="resource-description">Text Daniel your new work email and that you have joined both BAND and WhatsApp so we can welcome you!</div><div class="resource-links"><a href="tel:314-363-4922">📱 Text Daniel: 314-363-4922</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-aml" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Get AML (Anti Money Laundering) Certificate</div><div class="resource-description">This one is super fast and easy - and free!</div><div class="resource-links"><a href="https://www.americanamicable.com/internet/aml/start.php" target="_blank">Get AML Certificate</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                </ul>
                <button class="add-resource-btn" onclick="addResource('getting-started')">+ Add Resource</button>
            </div>

            <div class="resource-section training-section" data-section-id="training">
                <h2><span class="icon">📚</span> Training & Meetings</h2>
                <ul class="resource-list">
                    <li class="resource-item" data-resource-id="res-5" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Morning Huddles</div><div class="resource-description">Every Mon, Tues, Thurs at 10:30am EST. Unmute and introduce yourself when prompted!</div><div class="resource-links"><a href="https://cookzoomroom.com/" target="_blank">Join Huddle</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-6" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Summit Training on HQ</div><div class="resource-description">Complete Summit BASECAMP Steps 1-6. This should be completed within 48 hours of receiving your credentials.</div><div class="resource-links"><a href="https://sfghq.com/" target="_blank">Go to HQ</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-7" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Complete SureLC Contracting</div><div class="resource-description">Complete ALL steps in SureLC within 48 hours of receiving your credentials. Submit contracting requests for all available carriers.</div><div class="resource-links"><a href="https://surelc.surancebay.com/" target="_blank">Log into SureLC</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-8" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Production Training with Joe Martinez</div><div class="resource-description">Every Thursday at 12pm EST. Add this to your weekly calendar!</div><div class="resource-links"><a href="https://cookzoomroom.com/" target="_blank">Join Production Call</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-newagent" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">New Agent Kickoff Call</div><div class="resource-description">Every Friday at 11:30am EST. Important for new agents!</div><div class="resource-links"><a href="https://cookzoomroom.com/" target="_blank">Join New Agent Call</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-dial" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Dial Sessions</div><div class="resource-description">Join Zoom dial sessions to engage, listen, and learn from the team.</div><div class="resource-links"><a href="https://cookzoomroom.com/" target="_blank">Join Dial Session</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                </ul>
                <button class="add-resource-btn" onclick="addResource('training')">+ Add Resource</button>
            </div>

            <div class="resource-section video-section" data-section-id="video">
                <h2><span class="icon">🎬</span> Video Training</h2>
                <ul class="resource-list">
                    <li class="resource-item" data-resource-id="res-vid-invite1" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Invite New Agent Training</div><div class="resource-description">Essential videos for recruiting and inviting new agents to the team.</div><div class="resource-links"><a href="#" target="_blank">Part 1</a><a href="#" target="_blank" class="secondary">Part 2</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-vid-appt" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Appointment Training Videos</div><div class="resource-description">Learn how to run effective appointments with clients of different ages.</div><div class="resource-links"><a href="#" target="_blank">Critical Period (60+)</a><a href="#" target="_blank" class="secondary">Mortgage Protection</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-vid-dial" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Dial Training Videos</div><div class="resource-description">Master phone techniques with these training videos.</div><div class="resource-links"><a href="#" target="_blank">Part 1</a><a href="#" target="_blank" class="secondary">Part 2</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-vid-joe" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Joe's Production Training Vault</div><div class="resource-description">Complete video training playlist from Joe Martinez.</div><div class="resource-links"><a href="https://www.youtube.com/playlist?list=PLMIkXEr8mmFmPNwvFb0RxtSAzz6xWTnwY" target="_blank">📺 Watch Playlist</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-vid-7steps" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">7 Steps to Run an Effective Appointment</div><div class="resource-description">Step-by-step guide to running highly effective appointments.</div><div class="resource-links"><a href="#" target="_blank">Watch Video</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-vid-4keys" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">4 Keys to a Successful Week</div><div class="resource-description">Essential habits and practices for weekly success.</div><div class="resource-links"><a href="#" target="_blank">Watch Video</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-vid-4corner" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">4 Cornerstones</div><div class="resource-description">The four foundational pillars of success in this business.</div><div class="resource-links"><a href="#" target="_blank">Watch Video</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                </ul>
                <button class="add-resource-btn" onclick="addResource('video')">+ Add Resource</button>
            </div>

            <div class="resource-section audio-section" data-section-id="audio">
                <h2><span class="icon">🎧</span> Audio Training (SoundCloud)</h2>
                <ul class="resource-list">
                    <li class="resource-item" data-resource-id="res-sc-1" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Mastering the Phones with the Masters!</div><div class="resource-description">Learn phone sales techniques from top performers. Essential listening for new agents!</div><div class="resource-links"><a href="https://soundcloud.com/sfglife/sets/phones-with-masters" target="_blank">🎧 Listen on SoundCloud</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-sc-2" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">In the Home - Ashley Tarr</div><div class="resource-description">Learn best practices for in-home appointments from Ashley Tarr.</div><div class="resource-links"><a href="https://soundcloud.com/sfglife/in-the-home-ashley-tarr" target="_blank">🎧 Listen on SoundCloud</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-sc-3" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Critical Questions for Critical Period</div><div class="resource-description">Key questions to ask during the critical sales period. By Cicily &amp; Ayres Newsom.</div><div class="resource-links"><a href="https://soundcloud.com/sfglife/critical-questions-for-critical-period" target="_blank">🎧 Listen on SoundCloud</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-sc-4" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Working Older Leads</div><div class="resource-description">Strategies for effectively working with aged leads.</div><div class="resource-links"><a href="https://soundcloud.com/sfglife/working-older-leads" target="_blank">🎧 Listen on SoundCloud</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-sc-5" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Setting Up Your Role and Purpose</div><div class="resource-description">Define your role and purpose as an insurance agent. By Cicily &amp; Ayres Newsom.</div><div class="resource-links"><a href="https://soundcloud.com/sfglife/setting-up-your-role-purpose" target="_blank">🎧 Listen on SoundCloud</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                </ul>
                <button class="add-resource-btn" onclick="addResource('audio')">+ Add Resource</button>
            </div>

            <div class="resource-section tools-section" data-section-id="tools">
                <h2><span class="icon">🛠️</span> Tools & Resources</h2>
                <ul class="resource-list">
                    <li class="resource-item" data-resource-id="res-scripts" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">REAL Script (Sales Appointment Script)</div><div class="resource-description">Download and practice the REAL script. Go to HQ → Sales Tools → Sales Training → Training Scripts.</div><div class="resource-links"><a href="https://sfghq.com/" target="_blank">Go to HQ Scripts</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-quotes" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">SFG Quotes - Quoting Tool</div><div class="resource-description">Use this tool for quoting products to clients.</div><div class="resource-links"><a href="https://sfgquotes.com/" target="_blank">Open SFG Quotes</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-carrier" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Carrier List and Order</div><div class="resource-description">Reference guide for all available carriers and the order to present them.</div><div class="resource-links"><a href="#" target="_blank">View Carrier List</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-nepq" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">NEPQ Power Questions</div><div class="resource-description">Powerful questions to use in appointments to uncover needs and close sales.</div><div class="resource-links"><a href="#" target="_blank">View NEPQ Questions</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-cqf" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">CQF - Questions for Booking Appointments</div><div class="resource-description">Key qualifying questions to ask when booking appointments.</div><div class="resource-links"><a href="#" target="_blank">View CQF</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-older" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Intro to Older Leads - Role Play</div><div class="resource-description">How to work older leads effectively with role play examples.</div><div class="resource-links"><a href="#" target="_blank">View Role Play</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-activity" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Activity Tracker</div><div class="resource-description">Make a copy and use this to track your daily activity.</div><div class="resource-links"><a href="#" target="_blank">Get Activity Tracker</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-issue" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Issue Paid Tracker</div><div class="resource-description">Make a copy and use this to track your issued and paid business.</div><div class="resource-links"><a href="#" target="_blank">Get Issue Paid Tracker</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-upload" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Upload Completed Applications</div><div class="resource-description">Write your first application - Upload ALL completed applications/sales to Opt!</div><div class="resource-links"><a href="#" target="_blank">How to Upload</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-10" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Create Digital Business Card</div><div class="resource-description">See BAND under "Notice" for instructions. Check out David's card as an example.</div><div class="resource-links"><a href="https://www.hihello.me/" target="_blank">Create Digital Card</a><a href="https://card.hihello.me/david-roberts" target="_blank" class="secondary">David's Example</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-11" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Invest in Leads via LeadStream</div><div class="resource-description">Consult with Donelle on lead investments based on your personal goals. On HQ, click the 9 white boxes (top left) then click LeadStream.</div><div class="resource-links"><a href="https://sfghq.com/" target="_blank">LeadStream on HQ</a><a href="#" target="_blank" class="secondary">Lead ROI Fact Sheet</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-book" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Book of the Month</div><div class="resource-description">Get the "Book of the Month" and read 10 pages daily for personal development.</div><div class="resource-links"><a href="#" target="_blank">Current Book</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                    <li class="resource-item" data-resource-id="res-conference" draggable="true"><span class="drag-handle">⋮⋮</span><div class="resource-title">Secure Your Conference Ticket</div><div class="resource-description">Get your conference ticket directly from David Roberts.</div><div class="resource-links"><a href="tel:314-910-7474">📱 Contact David</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div></li>
                </ul>
                <button class="add-resource-btn" onclick="addResource('tools')">+ Add Resource</button>
            </div>
        </main>

        <footer class="guide-footer">Resource Guide<br><small>Questions? Contact Daniel Roberts at 314-363-4922</small></footer>
    </div>

    <script>
        let adminMode = false;
        let currentEditingElement = null;
        let editType = null;
        let draggedItem = null;

        function toggleAdminMode() {
            adminMode = !adminMode;
            document.body.classList.toggle('admin-mode', adminMode);
            const btn = document.getElementById('adminBtn');
            btn.classList.toggle('active', adminMode);
            btn.textContent = adminMode ? '🔓 Exit Owner Mode' : '🔧 Owner Mode';
            document.querySelectorAll('.resource-item').forEach(item => { item.draggable = adminMode; });
        }

        function initDragAndDrop() {
            document.querySelectorAll('.resource-item').forEach(item => {
                item.addEventListener('dragstart', handleDragStart);
                item.addEventListener('dragend', handleDragEnd);
                item.addEventListener('dragover', handleDragOver);
                item.addEventListener('drop', handleDrop);
                item.addEventListener('dragleave', handleDragLeave);
            });
        }

        function handleDragStart(e) {
            if (!adminMode) { e.preventDefault(); return; }
            draggedItem = this;
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        }

        function handleDragEnd(e) {
            this.classList.remove('dragging');
            document.querySelectorAll('.resource-item').forEach(item => { item.classList.remove('drag-over'); });
            draggedItem = null;
        }

        function handleDragOver(e) {
            if (!adminMode || !draggedItem) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const targetList = this.closest('.resource-list');
            const draggedList = draggedItem.closest('.resource-list');
            if (targetList === draggedList && this !== draggedItem) { this.classList.add('drag-over'); }
        }

        function handleDragLeave(e) { this.classList.remove('drag-over'); }

        function handleDrop(e) {
            e.preventDefault();
            if (!adminMode || !draggedItem || this === draggedItem) return;
            const targetList = this.closest('.resource-list');
            const draggedList = draggedItem.closest('.resource-list');
            if (targetList === draggedList) {
                const allItems = Array.from(targetList.querySelectorAll('.resource-item'));
                const draggedIndex = allItems.indexOf(draggedItem);
                const targetIndex = allItems.indexOf(this);
                if (draggedIndex < targetIndex) { this.parentNode.insertBefore(draggedItem, this.nextSibling); }
                else { this.parentNode.insertBefore(draggedItem, this); }
                saveSettings();
            }
            this.classList.remove('drag-over');
        }

        function uploadLogo() { if (adminMode) { document.getElementById('logoUpload').click(); } }
        function uploadPhoto() { if (adminMode) { document.getElementById('photoUpload').click(); } }

        function handleLogoUpload(event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const logoEl = document.getElementById('agencyLogo');
                    logoEl.outerHTML = '<img src="' + e.target.result + '" class="agency-logo" id="agencyLogo" onclick="uploadLogo()">';
                    saveSettings();
                };
                reader.readAsDataURL(file);
            }
        }

        function handlePhotoUpload(event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const photoEl = document.getElementById('contactPhoto');
                    photoEl.outerHTML = '<img src="' + e.target.result + '" class="contact-photo" id="contactPhoto" onclick="uploadPhoto()">';
                    saveSettings();
                };
                reader.readAsDataURL(file);
            }
        }

        function editResource(btn) {
            currentEditingElement = btn.closest('.resource-item');
            editType = 'resource';
            const title = currentEditingElement.querySelector('.resource-title').textContent;
            const description = currentEditingElement.querySelector('.resource-description').textContent;
            const links = currentEditingElement.querySelectorAll('.resource-links a');
            const currentSection = currentEditingElement.closest('.resource-section').dataset.sectionId;

            const sections = [
                { id: 'getting-started', name: '🚀 Getting Started' },
                { id: 'training', name: '📚 Training & Meetings' },
                { id: 'video', name: '🎬 Video Training' },
                { id: 'audio', name: '🎧 Audio Training' },
                { id: 'tools', name: '🛠️ Tools & Resources' }
            ];

            let sectionOptions = sections.map(s => '<option value="' + s.id + '"' + (s.id === currentSection ? ' selected' : '') + '>' + s.name + '</option>').join('');

            let fieldsHTML = '<div class="edit-field"><label>Section</label><select id="editSection" style="width:100%;padding:10px;border:2px solid #e9ecef;border-radius:8px;font-size:0.95em;">' + sectionOptions + '</select></div>';
            fieldsHTML += '<div class="edit-field"><label>Title</label><input type="text" id="editTitle" value="' + title + '"></div><div class="edit-field"><label>Description</label><textarea id="editDescription">' + description + '</textarea></div>';
            links.forEach((link, index) => {
                fieldsHTML += '<div class="edit-field"><label>Link ' + (index + 1) + ' Text</label><input type="text" id="editLinkText' + index + '" value="' + link.textContent + '"></div><div class="edit-field"><label>Link ' + (index + 1) + ' URL</label><input type="url" id="editLinkUrl' + index + '" value="' + link.href + '"></div>';
            });
            document.getElementById('editModalTitle').textContent = '✏️ Edit Resource';
            document.getElementById('editModalFields').innerHTML = fieldsHTML;
            document.getElementById('editModal').classList.add('show');
        }

        function editPrimaryContact() {
            editType = 'primaryContact';
            const fieldsHTML = '<div class="edit-field"><label>Name</label><input type="text" id="editContactName" value="Daniel Roberts"></div><div class="edit-field"><label>Phone</label><input type="tel" id="editContactPhone" value="314-363-4922"></div><div class="edit-field"><label>Email</label><input type="email" id="editContactEmail" value="RobertsFamilyAgency@gmail.com"></div><div class="edit-field"><label>Call to Action</label><input type="text" id="editContactCTA" value="Questions about ANYTHING? Text or call Daniel first!"></div>';
            document.getElementById('editModalTitle').textContent = '✏️ Edit Primary Contact';
            document.getElementById('editModalFields').innerHTML = fieldsHTML;
            document.getElementById('editModal').classList.add('show');
        }

        function editHeader() {
            editType = 'header';
            const title = document.querySelector('.guide-header h1').textContent;
            const fieldsHTML = '<div class="edit-field"><label>Title</label><input type="text" id="editHeaderTitle" value="' + title + '"></div>';
            document.getElementById('editModalTitle').textContent = '✏️ Edit Header';
            document.getElementById('editModalFields').innerHTML = fieldsHTML;
            document.getElementById('editModal').classList.add('show');
        }

        function closeEditModal() {
            document.getElementById('editModal').classList.remove('show');
            currentEditingElement = null;
            editType = null;
        }

        function saveEdits() {
            if (editType === 'resource' && currentEditingElement) {
                currentEditingElement.querySelector('.resource-title').textContent = document.getElementById('editTitle').value;
                currentEditingElement.querySelector('.resource-description').textContent = document.getElementById('editDescription').value;
                const links = currentEditingElement.querySelectorAll('.resource-links a');
                links.forEach((link, index) => {
                    const textInput = document.getElementById('editLinkText' + index);
                    const urlInput = document.getElementById('editLinkUrl' + index);
                    if (textInput && urlInput) { link.textContent = textInput.value; link.href = urlInput.value; }
                });

                // Handle section change
                const newSectionId = document.getElementById('editSection').value;
                const currentSection = currentEditingElement.closest('.resource-section').dataset.sectionId;
                if (newSectionId !== currentSection) {
                    const newSectionList = document.querySelector('[data-section-id="' + newSectionId + '"] .resource-list');
                    if (newSectionList) {
                        newSectionList.appendChild(currentEditingElement);
                    }
                }
            } else if (editType === 'primaryContact') {
                const details = document.getElementById('primaryContactDetails');
                details.innerHTML = '<div class="contact-name">' + document.getElementById('editContactName').value + '</div><div class="contact-info">📞 <a href="tel:' + document.getElementById('editContactPhone').value + '">' + document.getElementById('editContactPhone').value + '</a><br>✉️ <a href="mailto:' + document.getElementById('editContactEmail').value + '">' + document.getElementById('editContactEmail').value + '</a></div><div class="contact-cta">' + document.getElementById('editContactCTA').value + '</div>';
            } else if (editType === 'header') {
                document.querySelector('.guide-header h1').textContent = document.getElementById('editHeaderTitle').value;
            }
            closeEditModal();
            saveSettings();
        }

        function deleteResource(btn) {
            if (confirm('Are you sure you want to delete this resource?')) {
                btn.closest('.resource-item').remove();
                saveSettings();
            }
        }

        function addResource(sectionId) {
            const section = document.querySelector('[data-section-id="' + sectionId + '"] .resource-list');
            const newId = 'res-' + Date.now();
            const newResource = document.createElement('li');
            newResource.className = 'resource-item';
            newResource.dataset.resourceId = newId;
            newResource.draggable = adminMode;
            newResource.innerHTML = '<span class="drag-handle">⋮⋮</span><div class="resource-title">New Resource</div><div class="resource-description">Click edit to add a description.</div><div class="resource-links"><a href="#" target="_blank">Add Link</a></div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div>';
            newResource.addEventListener('dragstart', handleDragStart);
            newResource.addEventListener('dragend', handleDragEnd);
            newResource.addEventListener('dragover', handleDragOver);
            newResource.addEventListener('drop', handleDrop);
            newResource.addEventListener('dragleave', handleDragLeave);
            section.appendChild(newResource);
            saveSettings();
        }


        const FIREBASE_URL = 'https://agent-guide-cef3a-default-rtdb.firebaseio.com/settings.json';

        async function saveSettings() {
            const logoEl = document.getElementById('agencyLogo');
            const photoEl = document.getElementById('contactPhoto');
            const settings = {
                logo: logoEl && logoEl.src ? logoEl.src : null,
                photo: photoEl && photoEl.src ? photoEl.src : null,
                primaryContact: document.getElementById('primaryContactDetails').innerHTML,
                sections: {}
            };
            document.querySelectorAll('.resource-section').forEach(section => {
                const sectionId = section.dataset.sectionId;
                const items = section.querySelectorAll('.resource-item');
                settings.sections[sectionId] = Array.from(items).map(item => ({
                    id: item.dataset.resourceId,
                    title: item.querySelector('.resource-title').textContent,
                    description: item.querySelector('.resource-description').textContent,
                    links: Array.from(item.querySelectorAll('.resource-links a')).map(link => ({
                        text: link.textContent,
                        url: link.href,
                        isSecondary: link.classList.contains('secondary')
                    }))
                }));
            });
            try {
                await fetch(FIREBASE_URL, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(settings)
                });
                console.log('Settings saved to Firebase!');
            } catch (err) {
                console.error('Failed to save settings:', err);
            }
        }

        async function loadSettings() {
            try {
                const response = await fetch(FIREBASE_URL);
                const settings = await response.json();
                if (!settings || Object.keys(settings).length === 0) return;

                if (settings.logo && settings.logo.startsWith('data:')) {
                    const logoEl = document.getElementById('agencyLogo');
                    logoEl.outerHTML = '<img src="' + settings.logo + '" class="agency-logo" id="agencyLogo" onclick="uploadLogo()">';
                }
                if (settings.photo && settings.photo.startsWith('data:')) {
                    const photoEl = document.getElementById('contactPhoto');
                    photoEl.outerHTML = '<img src="' + settings.photo + '" class="contact-photo" id="contactPhoto" onclick="uploadPhoto()">';
                }
                if (settings.primaryContact) {
                    document.getElementById('primaryContactDetails').innerHTML = settings.primaryContact;
                }
                if (settings.sections) {
                    Object.keys(settings.sections).forEach(sectionId => {
                        const sectionList = document.querySelector('[data-section-id="' + sectionId + '"] .resource-list');
                        if (sectionList && settings.sections[sectionId]) {
                            sectionList.innerHTML = '';
                            settings.sections[sectionId].forEach(item => {
                                const li = document.createElement('li');
                                li.className = 'resource-item';
                                li.dataset.resourceId = item.id;
                                li.draggable = true;
                                const linksHtml = item.links.map(link =>
                                    '<a href="' + link.url + '" target="_blank" class="' + (link.isSecondary ? 'secondary' : '') + '">' + link.text + '</a>'
                                ).join('');
                                li.innerHTML = '<span class="drag-handle">⋮⋮</span><div class="resource-title">' + item.title + '</div><div class="resource-description">' + item.description + '</div><div class="resource-links">' + linksHtml + '</div><div class="resource-admin-controls"><button class="edit-btn" onclick="editResource(this)">✏️ Edit</button><button class="delete-btn" onclick="deleteResource(this)">🗑️ Delete</button></div>';
                                li.addEventListener('dragstart', handleDragStart);
                                li.addEventListener('dragend', handleDragEnd);
                                li.addEventListener('dragover', handleDragOver);
                                li.addEventListener('drop', handleDrop);
                                li.addEventListener('dragleave', handleDragLeave);
                                sectionList.appendChild(li);
                            });
                        }
                    });
                }
            } catch (err) {
                console.log('No saved settings found, using defaults');
            }
            initDragAndDrop();
        }

        document.addEventListener('DOMContentLoaded', function() {
            loadSettings();
        });
    </script>
        `,
      }}
    />
  );
}
