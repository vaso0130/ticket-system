// Ticketing Module
import { createModal, removeModal } from './ui.js';
import { processCreditCardPayment, processLinePayPayment, processAtmPayment } from './payment.js'; // Import payment processing functions
import { getSectionAvailableCount } from './eventManagement.js';

let appDataRef;
let saveDataCallbackRef;
let getCurrentUserCallbackRef;
let onPurchaseSuccessCallbackRef;

export function initTicketingModule(data, saveDataFunc, getCurrentUserFunc, onPurchaseSuccessFunc) {
    appDataRef = data;
    saveDataCallbackRef = saveDataFunc;
    getCurrentUserCallbackRef = getCurrentUserFunc;
    onPurchaseSuccessCallbackRef = onPurchaseSuccessFunc;
}

// Modal buy tickets
export function handleShowBuyTicketModal(event, session) { // Modified to accept event and session
    const { tickets } = appDataRef;
    const currentUser = getCurrentUserCallbackRef();
    const modal = createModal(); // Assuming createModal is globally available or imported correctly

    if (!event || !session || !session.sections || session.sections.length === 0) {
        createModal('錯誤', '<p>無法載入票券資訊，活動或場次資料不完整。</p>', [{ text: '關閉', onClick: () => removeModal() }]);
        return;
    }

    let sectionOptionsHtml = '';
    session.sections.forEach(section => {
        const venue = appDataRef.venues.find(v => v.id === event.venueId);
        const venueSection = venue ? venue.seatMap.find(vs => vs.id === section.sectionId) : null;
        const sectionName = venueSection ? venueSection.name : section.sectionId;
        const ticketsLeftInSection = getSectionAvailableCount(event.id, session.sessionId, section.sectionId, tickets, section.ticketsAvailable);
        if (ticketsLeftInSection > 0) { // Only show sections with available tickets
            sectionOptionsHtml += `<option value="${section.sectionId}">${sectionName} (NT$${section.price} - 剩餘 ${ticketsLeftInSection} 張)</option>`;
        }
    });

    if (!sectionOptionsHtml) {
        modal.box.innerHTML = `
            <h3>${event.title} - ${new Date(session.dateTime).toLocaleString()}</h3>
            <p>此場次所有區域的票券均已售完。</p>
            <div style="margin-top:1rem; text-align:right;">
                <button id="cancelBtnUser" style="margin-right:0.5rem; background:#888;">關閉</button>
            </div>
        `;
        modal.box.querySelector('#cancelBtnUser').onclick = () => removeModal(modal.overlay);
        return;
    }

    modal.box.innerHTML = `
      <h3>購買票券 - ${event.title}</h3>
      <h4>場次: ${new Date(session.dateTime).toLocaleString()}</h4>
      <label for="ticketSectionUser">選擇區域</label>
      <select id="ticketSectionUser" style="width:100%; padding:0.5rem; font-size:1rem; margin-bottom:1rem;">
        ${sectionOptionsHtml}
      </select>
      <div id="sectionDetailsUser" style="margin-bottom:1rem;"></div>

      <label for="seatingChoiceUser">選位方式</label>
      <select id="seatingChoiceUser" style="width:100%; padding:0.5rem; font-size:1rem; margin-bottom:1rem;">
        <option value="random">系統隨機選位</option>
        <option value="manual">自行選位</option>
      </select>

      <div id="ticketQuantityContainerUser">
        <label for="ticketQuantityUser">購買數量</label>
        <input type="number" id="ticketQuantityUser" min="1" value="1" style="width:100%; padding:0.5rem; font-size:1rem;" />
      </div>

      <div id="manualSeatingContainerUser" style="display:none; margin-bottom:1rem;">
        <button id="selectSeatsBtnUser" class="button">選擇座位</button>
        <div id="selectedSeatsInfoUser" style="margin-top:0.5rem;"></div>
      </div>

      <label for="payMethodUser" style="margin-top:1rem;">選擇支付方式</label>
      <select id="payMethodUser" style="width:100%; margin-top:0.25rem;">
        <option value="credit">信用卡</option>
        <option value="linepay">Line Pay</option>
        <option value="atm">ATM轉帳</option>
      </select>
      <div id="payFieldsUser" style="margin-top:1rem;"></div>
      <p id="buyErrorUser" class="error" style="display:none;"></p>
      <div style="margin-top:1rem; text-align:right;">
        <button id="cancelBtnUser" style="margin-right:0.5rem; background:#888;">取消</button>
        <button id="confirmBtnUser">確定購買</button>
      </div>
    `;

    const sectionSelect = modal.box.querySelector('#ticketSectionUser');
    const quantityInput = modal.box.querySelector('#ticketQuantityUser');
    const sectionDetailsDiv = modal.box.querySelector('#sectionDetailsUser');
    const seatingChoiceSelect = modal.box.querySelector('#seatingChoiceUser');
    const ticketQuantityContainer = modal.box.querySelector('#ticketQuantityContainerUser');
    const manualSeatingContainer = modal.box.querySelector('#manualSeatingContainerUser');
    const selectSeatsBtn = modal.box.querySelector('#selectSeatsBtnUser');
    const selectedSeatsInfoDiv = modal.box.querySelector('#selectedSeatsInfoUser');

    function updateTotalTicketsAvailable() {
        const selectedSectionId = sectionSelect.value;
        const selectedSection = session.sections.find(sec => sec.sectionId === selectedSectionId);
        if (selectedSection) {
            const ticketsLeft = getSectionAvailableCount(event.id, session.sessionId, selectedSection.sectionId, tickets, selectedSection.ticketsAvailable);
            quantityInput.max = ticketsLeft;
            quantityInput.value = Math.min(1, ticketsLeft); // Default to 1 or max available if less than 1
            sectionDetailsDiv.innerHTML = `<p>已選區域票價：NT$${selectedSection.price} | 剩餘票數：${ticketsLeft}</p>`;
            if (ticketsLeft === 0) {
                 modal.box.querySelector('#confirmBtnUser').disabled = true;
                 modal.box.querySelector('#buyErrorUser').textContent = '此區域已售完';
                 modal.box.querySelector('#buyErrorUser').style.display = 'block';
            } else {
                 modal.box.querySelector('#confirmBtnUser').disabled = false;
                 modal.box.querySelector('#buyErrorUser').style.display = 'none';
            }
        } else {
            sectionDetailsDiv.innerHTML = '';
            quantityInput.max = 0;
            quantityInput.value = 0;
        }
    }

    function updateSeatingChoiceVisibility() {
        const choice = seatingChoiceSelect.value;
        const selectedSectionId = sectionSelect.value;
        // 取得正確的 section 設定（以 venue seatMap 為主）
        const venue = appDataRef.venues.find(v => v.id === event.venueId);
        const selectedVenueSection = venue ? venue.seatMap.find(s => s.id === selectedSectionId) : null;

        if (selectedVenueSection && selectedVenueSection.seatingType === 'generalAdmission') {
            seatingChoiceSelect.value = 'random'; // Force random for general admission
            seatingChoiceSelect.disabled = true;
            ticketQuantityContainer.style.display = 'block';
            manualSeatingContainer.style.display = 'none';
        } else if (selectedVenueSection && selectedVenueSection.seatingType === 'numbered') {
            seatingChoiceSelect.disabled = false;
            if (choice === 'random') {
                ticketQuantityContainer.style.display = 'block';
                manualSeatingContainer.style.display = 'none';
            } else { // manual
                ticketQuantityContainer.style.display = 'none';
                manualSeatingContainer.style.display = 'block';
                selectedSeatsInfoDiv.textContent = '尚未選擇座位';
            }
        } else if (selectedVenueSection) {
            // 不支援的型態
            seatingChoiceSelect.disabled = true;
            ticketQuantityContainer.style.display = 'none';
            manualSeatingContainer.style.display = 'none';
            createModal('錯誤', '<p>未知的區域座位型態，請聯絡管理員。</p>', [{ text: '確定', onClick: () => removeModal() }]);
        }
    }

    selectSeatsBtn.onclick = () => {
        const loadingModal = createModal(
            '選位系統',
            '<div class="modal-loading-content"><div class="spinner"></div><p>載入選位介面中...</p></div>',
            []
        );
        setTimeout(() => {
            removeModal(loadingModal.overlay); // Remove loading modal
            // Show failure message in a new modal or update an existing one
            createModal(
                '選位失敗',
                '<p>選位功能目前測試中，暫時無法使用。</p>',
                [{ text: '關閉', onClick: () => removeModal() }]
            );
            selectedSeatsInfoDiv.textContent = '選位失敗 (測試中)';
        }, 2000); // Simulate loading time
    };

    sectionSelect.addEventListener('change', () => {
        updateTotalTicketsAvailable();
        updateSeatingChoiceVisibility();
    });
    seatingChoiceSelect.addEventListener('change', updateSeatingChoiceVisibility);

    updateTotalTicketsAvailable(); // Initial call
    updateSeatingChoiceVisibility(); // Initial call for seating choice visibility

    function renderPayFields() {
        const method = modal.box.querySelector('#payMethodUser').value;
        const payFields = modal.box.querySelector('#payFieldsUser');
        if (method === 'credit') {
            payFields.innerHTML = `
          <label for="cardNumUser">信用卡號</label>
          <input type="text" id="cardNumUser" maxlength="19" placeholder="XXXX-XXXX-XXXX-XXXX" />
          <label for="cardExpUser">有效期限 (MM/YY)</label>
          <input type="text" id="cardExpUser" maxlength="5" placeholder="MM/YY" />
          <label for="cardCVCUser">安全碼</label>
          <input type="text" id="cardCVCUser" maxlength="3" placeholder="CVC" />
        `;
            // Add input formatting for card number and expiry date
            const cardNumInput = payFields.querySelector('#cardNumUser');
            const cardExpInput = payFields.querySelector('#cardExpUser');

            cardNumInput.addEventListener('input', formatCardNumber);
            cardExpInput.addEventListener('input', formatExpiryDate);

        } else if (method === 'linepay') {
            payFields.innerHTML = `
          <p>您將被引導至 LINE Pay 進行安全付款。</p>
        `;
        } else if (method === 'atm') {
            payFields.innerHTML = `
          <div id="atmInfoUser" style="background:#f0f0f0; padding:1rem; border-radius:8px; margin-bottom:1rem;">
            <strong>銀行代碼：</strong> 822<br>
            <strong>轉帳帳號：</strong> 1234-5678-9000-8888
          </div>
        `;
        }
    }
    renderPayFields();
    modal.box.querySelector('#payMethodUser').onchange = renderPayFields;

    // Helper function to format card number input with hyphens
    function formatCardNumber(e) {
        let value = e.target.value.replace(/\D/g, ''); // Remove non-digits
        let formattedValue = '';
        for (let i = 0; i < value.length; i++) {
            if (i > 0 && i % 4 === 0) {
                formattedValue += '-';
            }
            formattedValue += value[i];
        }
        e.target.value = formattedValue.substring(0, 19); // Max length 16 digits + 3 hyphens
    }

    // Helper function to format expiry date input with a slash
    function formatExpiryDate(e) {
        let value = e.target.value.replace(/\D/g, ''); // Remove non-digits
        if (value.length > 2) {
            value = value.substring(0, 2) + '/' + value.substring(2, 4);
        }
        e.target.value = value.substring(0, 5);
    }

    modal.box.querySelector('#cancelBtnUser').onclick = () => {
        removeModal(modal.overlay);
    };

    modal.box.querySelector('#confirmBtnUser').onclick = async () => {
        const buyError = modal.box.querySelector('#buyErrorUser');
        buyError.style.display = 'none';

        const selectedSectionId = sectionSelect.value;
        const concertEventSection = session.sections.find(sec => sec.sectionId === selectedSectionId);
        const venue = appDataRef.venues.find(v => v.id === event.venueId);
        const venueSectionLayout = venue?.seatMap.find(vs => vs.id === selectedSectionId);

        let requestedQuantity = 0;
        let assignedSeats = [];

        if (!concertEventSection || !venueSectionLayout) {
            buyError.textContent = '無法獲取區域詳細資訊，請重試。';
            buyError.style.display = 'block';
            return;
        }

        const seatingChoice = seatingChoiceSelect.value;

        // Determine requested quantity based on UI
        if (venueSectionLayout.seatingType === 'numbered' && seatingChoice === 'manual') {
            if (selectedSeatsInfoDiv.textContent === '選位失敗 (測試中)' || selectedSeatsInfoDiv.textContent === '尚未選擇座位') {
                buyError.textContent = '請先完成自行選位或選擇系統隨機選位。';
                buyError.style.display = 'block';
                return;
            }
            // This part is not fully implemented, so we stop here for manual selection.
            buyError.textContent = '自行選位功能尚在開發中，無法透過此方式完成購買。';
            buyError.style.display = 'block';
            return;
        } else {
            requestedQuantity = parseInt(quantityInput.value);
            if (isNaN(requestedQuantity) || requestedQuantity < 1) {
                buyError.textContent = '請輸入有效的購買數量。';
                buyError.style.display = 'block';
                return;
            }
        }

        // --- UNIFIED AVAILABILITY CHECK ---
        // Use the single source of truth to check if enough tickets are available to be sold.
        const ticketsAvailable = getSectionAvailableCount(event.id, session.sessionId, selectedSectionId, appDataRef.tickets, concertEventSection.ticketsAvailable);
        if (requestedQuantity > ticketsAvailable) {
            buyError.textContent = `此區域剩餘票數不足 (僅剩 ${ticketsAvailable} 張)。`;
            buyError.style.display = 'block';
            return;
        }
        // --- END OF UNIFIED CHECK ---

        let availableTickets = null;
        if (venueSectionLayout.seatingType === 'numbered') {
            // 直接從可販售票券中找連號座位
            availableTickets = appDataRef.tickets.filter(t =>
                String(t.concertId) === String(event.id) &&
                String(t.sessionId) === String(session.sessionId) &&
                String(t.sectionId) === String(selectedSectionId) &&
                t.status === 'normal' && t.seats && t.seats.length === 1 && t.seats[0].row && t.seats[0].seat
            );
            // 依 row, seat 排序
            availableTickets.sort((a, b) => {
                if (a.seats[0].row !== b.seats[0].row) return a.seats[0].row - b.seats[0].row;
                return a.seats[0].seat - b.seats[0].seat;
            });
            let found = false;
            for (let i = 0; i <= availableTickets.length - requestedQuantity; i++) {
                const block = availableTickets.slice(i, i + requestedQuantity);
                const sameRow = block.every(t => t.seats[0].row === block[0].seats[0].row);
                const consecutive = block.every((t, idx) => idx === 0 || t.seats[0].seat === block[0].seats[0].seat + idx);
                if (sameRow && consecutive) {
                    assignedSeats = block.map(t => t.seats[0]);
                    found = true;
                    break;
                }
            }
            if (!found) {
                // 若找不到連號，則隨機取可用票券
                assignedSeats = availableTickets.slice(0, requestedQuantity).map(t => t.seats[0]);
            }
        } else if (venueSectionLayout.seatingType === 'generalAdmission') {
            // Availability is already checked above. Just create the seat objects.
            for (let i = 0; i < requestedQuantity; i++) {
                assignedSeats.push({ type: 'generalAdmission', description: '自由座' });
            }
        } else {
            buyError.textContent = '未知的區域座位型態，請聯絡管理員。';
            buyError.style.display = 'block';
            return;
        }

        if (assignedSeats.length === 0 && requestedQuantity > 0) {
            // 增加詳細的日誌以供除錯
            console.error('未能成功分配座位 - 除錯資訊:', {
                sessionId: session.sessionId,
                sectionId: selectedSectionId,
                requestedQuantity: requestedQuantity,
                availableTickets: availableTickets ? availableTickets.length : undefined,
                assignedSeats: assignedSeats ? assignedSeats.length : undefined
            });
            buyError.textContent = '未能成功分配座位，請檢查數量或選位方式並重試。';
            buyError.style.display = 'block';
            return;
        }
        if (assignedSeats.length === 0) {
            buyError.textContent = '沒有選擇任何座位或有效數量。';
            buyError.style.display = 'block';
            return;
        }

        const actualQuantityToPurchase = assignedSeats.length;
        const totalPrice = concertEventSection.price * actualQuantityToPurchase;
        const paymentMethod = modal.box.querySelector('#payMethodUser').value;

        const confirmBtn = modal.box.querySelector('#confirmBtnUser');
        confirmBtn.disabled = true;
        confirmBtn.textContent = '處理中...';

        try {
            const paymentDetails = {
                event: event,
                session: session,
                selectedSection: concertEventSection,
                quantity: actualQuantityToPurchase,
                seats: assignedSeats,
                seatingType: venueSectionLayout.seatingType
            };

            const handlePurchaseSuccess = (createdTickets) => {
                console.log("Purchase successful! Created tickets:", createdTickets);
                // This function is now the callback for payment processing
                // It receives the tickets created by completePurchase
                // Update UI or perform other actions as needed
                // For example, re-render user tickets list or event list
                if (typeof renderUserTickets === "function" && document.getElementById('userTickets')) {
                    renderUserTickets();
                }
                if (typeof renderEventList === "function" && document.getElementById('eventList')) {
                    renderEventList(appDataRef.concerts);
                }
            };

            if (paymentMethod === 'credit') {
                await processCreditCardPayment(modal, paymentDetails, handlePurchaseSuccess);
            } else if (paymentMethod === 'linepay') {
                await processLinePayPayment(modal, paymentDetails, handlePurchaseSuccess);
            } else if (paymentMethod === 'atm') {
                await processAtmPayment(modal, paymentDetails, handlePurchaseSuccess);
            }

        } catch (error) {
            console.error("Payment processing error:", error);
            buyError.textContent = error.message || '付款處理失敗，請檢查付款資訊或稍後再試。';
            buyError.style.display = 'block';
            confirmBtn.disabled = false;
            confirmBtn.textContent = '確定購買';
            return;
        }
    };

    // Attach event listener for payment method change
}

