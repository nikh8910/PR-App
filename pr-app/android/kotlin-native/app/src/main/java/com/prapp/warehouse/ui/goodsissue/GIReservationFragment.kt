package com.prapp.warehouse.ui.goodsissue

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.*
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import com.google.android.material.button.MaterialButton
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.*
import com.prapp.warehouse.data.repository.SapRepository
import com.prapp.warehouse.utils.NetworkResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate

/**
 * GIReservationFragment — mirrors GoodsIssueReservation.jsx
 *
 * Flow:
 *  1. Auto-loads open reservations on mount.
 *  2. Search / filter by reservation number.
 *  3. Toggle "Show Completed" (reservationIsFinallyIssued items excluded otherwise).
 *  4. Tap a reservation to expand → "View Items" button.
 *  5. Items dialog: per-item issuing plant, storage location, quantity edit.
 *  6. "Post GI" posts all configured items (mvt 261 or item's movement type) via postGoodsMovement.
 */
class GIReservationFragment : Fragment(R.layout.fragment_gi_reservation) {

    private lateinit var repository: SapRepository
    private var allReservations = listOf<Reservation>()
    private var showCompleted = false
    private var expandedResId: String? = null

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        repository = SapRepository(requireActivity().application)

        val progressBar = view.findViewById<ProgressBar>(R.id.progress_bar)
        val textError = view.findViewById<TextView>(R.id.text_error)
        val textSuccess = view.findViewById<TextView>(R.id.text_success)
        val inputSearch = view.findViewById<EditText>(R.id.input_search)
        val btnToggle = view.findViewById<MaterialButton>(R.id.btn_toggle_completed)
        val recycler = view.findViewById<androidx.recyclerview.widget.RecyclerView>(R.id.recycler_reservations)

        recycler.layoutManager = androidx.recyclerview.widget.LinearLayoutManager(requireContext())

        view.findViewById<ImageView>(R.id.btn_back)?.setOnClickListener { findNavController().popBackStack() }

        fun getOpenCount(res: Reservation): Pair<Int, Int> {
            val items = res.items?.d?.results ?: emptyList()
            val open = items.count { it.reservationIsFinallyIssued != true }
            return Pair(open, items.size)
        }

        fun applyFilter() {
            val query = inputSearch.text?.toString()?.trim()?.lowercase() ?: ""
            val filtered = allReservations.filter { res ->
                val (openCount, _) = getOpenCount(res)
                if (!showCompleted && openCount == 0) return@filter false
                if (query.isEmpty()) return@filter true
                res.reservation.lowercase().contains(query)
            }
            recycler.adapter = ReservationListAdapter(filtered, { res ->
                expandedResId = if (expandedResId == res.reservation) null else res.reservation
                recycler.adapter?.notifyDataSetChanged()
            }, { res ->
                showItemsDialog(res, textError, textSuccess)
            }, getOpenCount = { res -> getOpenCount(res) }, expandedId = expandedResId)
        }

        btnToggle.setOnClickListener {
            showCompleted = !showCompleted
            btnToggle.text = if (showCompleted) "✓ All" else "Completed"
            applyFilter()
        }

        inputSearch.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) = applyFilter()
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
        })

        progressBar.visibility = View.VISIBLE
        CoroutineScope(Dispatchers.IO).launch {
            val result = repository.getReservations()
            withContext(Dispatchers.Main) {
                progressBar.visibility = View.GONE
                when (result) {
                    is NetworkResult.Success -> {
                        allReservations = result.data?.d?.results ?: emptyList()
                        applyFilter()
                    }
                    else -> { textError.text = result.message ?: "Failed to load reservations."; textError.visibility = View.VISIBLE }
                }
            }
        }
    }

    private fun showItemsDialog(res: Reservation, textError: TextView, textSuccess: TextView) {
        val items = res.items?.d?.results?.filter { it.reservationIsFinallyIssued != true }?.toMutableList() ?: mutableListOf()
        if (items.isEmpty()) { textError.text = "No open items for this reservation."; textError.visibility = View.VISIBLE; return }

        val ctx = requireContext()
        val dlgLayout = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL; setPadding(32, 32, 32, 32) }

        val titleView = TextView(ctx).apply {
            text = "Reservation ${res.reservation}"; textSize = 18f; setTypeface(null, android.graphics.Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).also { it.bottomMargin = 16 }
        }
        dlgLayout.addView(titleView)

        val itemViews = items.mapIndexed { _, item ->
            val reqQty = item.requirementQuantity?.toDoubleOrNull() ?: 0.0

            val card = LinearLayout(ctx).apply {
                orientation = LinearLayout.VERTICAL; setPadding(24, 24, 24, 24)
                background = ctx.getDrawable(R.drawable.bg_card)
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).also { it.bottomMargin = 16 }
            }
            val matLabel = TextView(ctx).apply { text = "#${item.reservationItem}  ${item.material?.trimStart('0') ?: "?"}"; textSize = 14f; setTypeface(null, android.graphics.Typeface.BOLD) }
            val plantLabel = TextView(ctx).apply { text = "Issuing Plant"; textSize = 11f; setTextColor(0xFF1E3A5F.toInt()) }
            val plantInput = EditText(ctx).apply { setText(item.plant ?: ""); textSize = 14f; inputType = android.text.InputType.TYPE_CLASS_TEXT }
            val slocLabel = TextView(ctx).apply { text = "Storage Location"; textSize = 11f; setTextColor(0xFF1E3A5F.toInt()) }
            val slocInput = EditText(ctx).apply { setText(item.storageLocation ?: ""); textSize = 14f; inputType = android.text.InputType.TYPE_CLASS_TEXT }
            val qtyLabel = TextView(ctx).apply { text = "Issue Qty (Requested: ${item.requirementQuantity ?: 0} ${item.baseUnit ?: ""})"; textSize = 11f; setTextColor(0xFF64748B.toInt()) }
            val qtyInput = EditText(ctx).apply { setText(reqQty.toInt().toString()); textSize = 14f; inputType = android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL }

            card.addView(matLabel); card.addView(plantLabel); card.addView(plantInput)
            card.addView(slocLabel); card.addView(slocInput)
            card.addView(qtyLabel); card.addView(qtyInput)
            dlgLayout.addView(card)

            Triple(plantInput, slocInput, qtyInput)
        }

        val postBtn = MaterialButton(ctx).apply { text = "Post GI" }
        dlgLayout.addView(postBtn)

        val scrollView = ScrollView(ctx).apply { addView(dlgLayout) }
        val dlg = android.app.AlertDialog.Builder(ctx).setView(scrollView).setNegativeButton("Cancel", null).create()

        postBtn.setOnClickListener {
            val today = try { LocalDate.now().toString() } catch (e: Exception) { "2025-01-01" }
            val apiItems = items.mapIndexedNotNull { idx, item ->
                val (plantInput, slocInput, qtyInput) = itemViews[idx]
                val plant = plantInput.text.toString().trim()
                val sloc = slocInput.text.toString().trim()
                val qty = qtyInput.text.toString().toDoubleOrNull() ?: 0.0
                if (qty <= 0 || plant.isBlank() || sloc.isBlank()) null
                else GoodsMovementItem(
                    material = item.material ?: "", plant = plant,
                    storageLocation = sloc, quantityInEntryUnit = qty.toString(),
                    entryUnit = item.baseUnit ?: "EA",
                    goodsMovementType = item.goodsMovementType ?: "261",
                    reservation = res.reservation, reservationItem = item.reservationItem
                )
            }
            if (apiItems.isEmpty()) { Toast.makeText(ctx, "No valid items to post — check plant, SLoc and qty.", Toast.LENGTH_LONG).show(); return@setOnClickListener }

            dlg.dismiss()
            textError.visibility = View.GONE; textSuccess.visibility = View.GONE
            CoroutineScope(Dispatchers.IO).launch {
                val csrfToken = repository.fetchCsrfToken() ?: ""
                val payload = GoodsMovementPostRequest(
                    goodsMovementCode = "04", documentDate = today, postingDate = today,
                    toGoodsMovementItem = GoodsMovementItemList(apiItems)
                )
                val result = repository.postGoodsMovement(csrfToken, payload)
                withContext(Dispatchers.Main) {
                    when (result) {
                        is NetworkResult.Success -> {
                            val matDoc = result.data?.d?.materialDocument ?: result.data?.materialDocument ?: ""
                            textSuccess.text = "✓ GI Posted${if (matDoc.isNotBlank()) " — Mat. Doc: $matDoc" else ""}"; textSuccess.visibility = View.VISIBLE
                        }
                        else -> { textError.text = result.message ?: "GI failed."; textError.visibility = View.VISIBLE }
                    }
                }
            }
        }
        dlg.show()
    }
}

private class ReservationListAdapter(
    private val items: List<Reservation>,
    private val onExpand: (Reservation) -> Unit,
    private val onViewItems: (Reservation) -> Unit,
    private val getOpenCount: (Reservation) -> Pair<Int, Int>,
    private val expandedId: String?
) : androidx.recyclerview.widget.RecyclerView.Adapter<ReservationListAdapter.VH>() {

    inner class VH(val root: LinearLayout) : androidx.recyclerview.widget.RecyclerView.ViewHolder(root)

    override fun onCreateViewHolder(parent: android.view.ViewGroup, viewType: Int): VH {
        val ll = LinearLayout(parent.context).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = androidx.recyclerview.widget.RecyclerView.LayoutParams(
                androidx.recyclerview.widget.RecyclerView.LayoutParams.MATCH_PARENT,
                androidx.recyclerview.widget.RecyclerView.LayoutParams.WRAP_CONTENT
            ).also { (it as? android.view.ViewGroup.MarginLayoutParams)?.setMargins(0, 0, 0, 16) }
        }
        return VH(ll)
    }

    override fun getItemCount() = items.size

    override fun onBindViewHolder(holder: VH, position: Int) {
        val ctx = holder.root.context
        val res = items[position]
        val (openCount, totalCount) = getOpenCount(res)
        val isExpanded = expandedId == res.reservation
        holder.root.removeAllViews()

        val card = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            background = ctx.getDrawable(R.drawable.bg_card)
            setPadding(0, 0, 0, 0)
            setOnClickListener { onExpand(res) }
        }
        val strip = View(ctx).apply {
            layoutParams = LinearLayout.LayoutParams(8, LinearLayout.LayoutParams.MATCH_PARENT)
            setBackgroundColor(0xFF6366F1.toInt())
        }
        val content = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL; setPadding(16, 12, 16, 12)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val headerRow = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = android.view.Gravity.CENTER_VERTICAL }
        val titleTv = TextView(ctx).apply {
            text = "#${res.reservation}"; textSize = 16f; setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(0xFFF1F5F9.toInt())
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val statusBadge = TextView(ctx).apply {
            text = if (openCount > 0) "$openCount / $totalCount Open" else "Complete"
            textSize = 10f; setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(if (openCount > 0) 0xFF818CF8.toInt() else 0xFF64748B.toInt())
        }
        headerRow.addView(titleTv); headerRow.addView(statusBadge)
        val dateTv = TextView(ctx).apply { text = "Date: ${res.reservationDate ?: "N/A"}"; textSize = 12f; setTextColor(0xFF94A3B8.toInt()) }
        content.addView(headerRow); content.addView(dateTv)

        if (isExpanded) {
            val extra = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL; setPadding(0, 12, 0, 0) }
            val viewItemsBtn = MaterialButton(ctx).apply {
                text = "View Items"; setOnClickListener { onViewItems(res) }
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).also { it.topMargin = 12 }
            }
            extra.addView(viewItemsBtn)
            content.addView(extra)
        }

        card.addView(strip); card.addView(content)
        holder.root.addView(card)
    }
}
