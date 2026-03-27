package com.prapp.warehouse.ui.goodsissue

import android.os.Bundle
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
 * GISTOFragment — mirrors GoodsIssueSTO.jsx
 *
 * Flow:
 *  1. Filter form: STO Number, Supplying Plant, Supplier, Date From/To.
 *  2. "Search STOs" → fetches Purchase Orders with type UB.
 *  3. STO list with open/partial/complete status badge.
 *  4. Tap STO → expand → "View Items & Post GI".
 *  5. Items screen: per-item plant, SLoc, qty edit + in-transit detection from mat. docs (mvt 351).
 *  6. "Post GI" posts items as movement type 351 (stock into transit).
 */
class GISTOFragment : Fragment(R.layout.fragment_gi_sto) {

    private lateinit var repository: SapRepository
    private var allStos = listOf<PurchaseOrder>()
    private var expandedStoId: String? = null

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        repository = SapRepository(requireActivity().application)

        val progressBar = view.findViewById<ProgressBar>(R.id.progress_bar)
        val textError = view.findViewById<TextView>(R.id.text_error)
        val textSuccess = view.findViewById<TextView>(R.id.text_success)
        val layoutFilter = view.findViewById<View>(R.id.layout_filter)
        val layoutList = view.findViewById<LinearLayout>(R.id.layout_list)
        val inputStoNumber = view.findViewById<EditText>(R.id.input_sto_number)
        val inputSupplyingPlant = view.findViewById<EditText>(R.id.input_supplying_plant)
        val inputSupplier = view.findViewById<EditText>(R.id.input_supplier)
        val inputDateFrom = view.findViewById<EditText>(R.id.input_date_from)
        val inputDateTo = view.findViewById<EditText>(R.id.input_date_to)
        val btnSearch = view.findViewById<MaterialButton>(R.id.btn_search)
        val btnChangeFilters = view.findViewById<MaterialButton>(R.id.btn_change_filters)
        val textResultCount = view.findViewById<TextView>(R.id.text_result_count)
        val recyclerSTOs = view.findViewById<androidx.recyclerview.widget.RecyclerView>(R.id.recycler_stos)

        recyclerSTOs.layoutManager = androidx.recyclerview.widget.LinearLayoutManager(requireContext())

        view.findViewById<ImageView>(R.id.btn_back)?.setOnClickListener { findNavController().popBackStack() }
        view.findViewById<ImageView>(R.id.btn_home)?.setOnClickListener { findNavController().navigate(R.id.dashboardFragment) }

        // Set default dates: today and 90 days ago
        try {
            val today = LocalDate.now()
            val ninetyAgo = today.minusDays(90)
            inputDateFrom.setText(ninetyAgo.toString())
            inputDateTo.setText(today.toString())
        } catch (e: Exception) { /* pre-API26 fallback */ }

        fun showStoList(stos: List<PurchaseOrder>) {
            allStos = stos
            textResultCount.text = "${stos.size} STO(s) found"
            layoutFilter.visibility = View.GONE
            layoutList.visibility = View.VISIBLE

            recyclerSTOs.adapter = StoListAdapter(stos, { sto ->
                expandedStoId = if (expandedStoId == sto.purchaseOrder) null else sto.purchaseOrder
                recyclerSTOs.adapter?.notifyDataSetChanged()
            }, { sto ->
                showStoItemsDialog(sto, textError, textSuccess)
            }, expandedId = expandedStoId)
        }

        btnChangeFilters.setOnClickListener {
            layoutFilter.visibility = View.VISIBLE; layoutList.visibility = View.GONE
        }

        btnSearch.setOnClickListener {
            val stoNum = inputStoNumber.text?.toString()?.trim() ?: ""
            val supplyingPlant = inputSupplyingPlant.text?.toString()?.trim()?.uppercase() ?: ""
            val supplier = inputSupplier.text?.toString()?.trim()?.uppercase() ?: ""
            val dateFrom = inputDateFrom.text?.toString()?.trim() ?: ""
            val dateTo = inputDateTo.text?.toString()?.trim() ?: ""

            if (stoNum.isBlank() && supplyingPlant.isBlank() && supplier.isBlank() && dateFrom.isBlank()) {
                textError.text = "Enter at least one filter (STO #, Supplying Plant, Supplier, or Date)."; textError.visibility = View.VISIBLE; return@setOnClickListener
            }

            textError.visibility = View.GONE; textSuccess.visibility = View.GONE
            progressBar.visibility = View.VISIBLE

            var filter: String? = null
            if (stoNum.isNotBlank()) {
                filter = "PurchaseOrder eq '$stoNum'"
            } else {
                val parts = mutableListOf("PurchaseOrderType eq 'UB'")
                if (supplyingPlant.isNotBlank()) parts.add("SupplyingPlant eq '$supplyingPlant'")
                if (supplier.isNotBlank()) parts.add("Supplier eq '$supplier'")
                if (dateFrom.isNotBlank()) parts.add("OrderDate ge datetime'${dateFrom}T00:00:00'")
                if (dateTo.isNotBlank()) parts.add("OrderDate le datetime'${dateTo}T23:59:59'")
                filter = parts.joinToString(" and ")
            }

            CoroutineScope(Dispatchers.IO).launch {
                val result = repository.getPurchaseOrders(filter = filter, top = if (stoNum.isNotBlank()) 5 else 100)
                withContext(Dispatchers.Main) {
                    progressBar.visibility = View.GONE
                    when (result) {
                        is NetworkResult.Success -> {
                            val stos = result.data?.d?.results ?: emptyList()
                            showStoList(stos)
                        }
                        else -> { textError.text = result.message ?: "Failed to load STOs."; textError.visibility = View.VISIBLE }
                    }
                }
            }
        }
    }

    private fun showStoItemsDialog(sto: PurchaseOrder, textError: TextView, textSuccess: TextView) {
        val context = requireContext()
        val progressDialog = android.app.AlertDialog.Builder(context)
            .setMessage("Loading items…").setCancelable(false).create().also { it.show() }

        CoroutineScope(Dispatchers.IO).launch {
            val poNum = sto.purchaseOrder ?: ""

            // Load PO items then mat doc items sequentially
            val itemsResult = repository.getPurchaseOrderItems(poNum)
            val matDocResult = repository.getMaterialDocumentItems(poNum, "351")

            val items: List<PurchaseOrderItem> = when (itemsResult) {
                is NetworkResult.Success -> itemsResult.data?.d?.results ?: emptyList()
                else -> emptyList()
            }

            // Build in-transit map
            val issuedQtyMap = mutableMapOf<String, Double>()
            val matDocMap = mutableMapOf<String, String>()
            val matDocItems: List<MaterialDocumentItem> = when (matDocResult) {
                is NetworkResult.Success -> matDocResult.data?.d?.results ?: matDocResult.data?.value ?: emptyList()
                else -> emptyList()
            }
            matDocItems.forEach { md ->
                val key = md.purchaseOrderItem ?: return@forEach
                val stripped = key.trimStart('0').ifBlank { key }
                val qty = md.quantityInEntryUnit?.toDoubleOrNull() ?: 0.0
                issuedQtyMap[key] = (issuedQtyMap[key] ?: 0.0) + qty
                issuedQtyMap[stripped] = (issuedQtyMap[stripped] ?: 0.0) + qty
                md.materialDocument?.let { matDocMap[key] = it; matDocMap[stripped] = it }
            }

            // Annotate items → StoItem
            val stoItems = items.map { poItem ->
                val key = poItem.purchaseOrderItem
                val stripped = key.trimStart('0').ifBlank { key }
                val alreadyIssued = issuedQtyMap[key] ?: issuedQtyMap[stripped] ?: 0.0
                val orderQty = poItem.orderQuantity.toDoubleOrNull() ?: 0.0
                val rcvdQty = 0.0
                val openQty = maxOf(0.0, orderQty - rcvdQty)
                StoItem(
                    purchaseOrderItem = key,
                    material = poItem.material,
                    itemText = poItem.itemText,
                    plant = poItem.plant,
                    storageLocation = poItem.storageLocation,
                    orderQuantity = orderQty,
                    goodsReceiptQuantity = rcvdQty,
                    unit = poItem.unit,
                    alreadyIssuedQty = alreadyIssued,
                    giPosted = alreadyIssued > 0 && alreadyIssued >= openQty,
                    matDoc = matDocMap[key] ?: matDocMap[stripped]
                ).also { si ->
                    si.editedPlant = poItem.plant
                    si.editedStorageLoc = poItem.storageLocation
                }
            }

            withContext(Dispatchers.Main) {
                progressDialog.dismiss()
                if (items.isEmpty()) { textError.text = "No items for this STO."; textError.visibility = View.VISIBLE; return@withContext }

                val dlgLayout = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; setPadding(32, 32, 32, 32) }

                val titleTv = TextView(context).apply {
                    text = "STO #${sto.purchaseOrder?.trimStart('0')}"; textSize = 18f; setTypeface(null, android.graphics.Typeface.BOLD)
                    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).also { it.bottomMargin = 8 }
                }
                val subtitleTv = TextView(context).apply {
                    text = "Supplier: ${sto.supplier ?: "N/A"}  •  Type: ${sto.purchaseOrderType} — Movement 351"; textSize = 12f; setTextColor(0xFF64748B.toInt())
                    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).also { it.bottomMargin = 16 }
                }
                dlgLayout.addView(titleTv); dlgLayout.addView(subtitleTv)

                val itemViews = stoItems.map { si ->
                    val card = LinearLayout(context).apply {
                        orientation = LinearLayout.VERTICAL; setPadding(20, 16, 20, 16)
                        background = context.getDrawable(R.drawable.bg_card)
                        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).also { it.bottomMargin = 12 }
                    }
                    val matTv = TextView(context).apply { text = "#${si.purchaseOrderItem}  ${si.material.trimStart('0')}"; textSize = 14f; setTypeface(null, android.graphics.Typeface.BOLD) }
                    val statusTv = TextView(context).apply {
                        text = if (si.giPosted) "✈ In Transit ${si.matDoc?.let { "— $it" } ?: ""}" else "Open: ${si.remainingQty.toInt()} ${si.unit}"
                        textSize = 12f; setTextColor(if (si.giPosted) 0xFF3B82F6.toInt() else 0xFF64748B.toInt())
                    }
                    card.addView(matTv); card.addView(statusTv)

                    var plantInput: EditText? = null
                    var slocInput: EditText? = null
                    var qtyInput: EditText? = null

                    if (!si.giPosted) {
                        val plantLabel = TextView(context).apply { text = "Issuing Plant"; textSize = 11f; setTextColor(0xFF1E3A5F.toInt()) }
                        plantInput = EditText(context).apply { setText(si.editedPlant ?: si.plant); textSize = 13f }
                        val slocLabel = TextView(context).apply { text = "Storage Location"; textSize = 11f; setTextColor(0xFF1E3A5F.toInt()) }
                        slocInput = EditText(context).apply { setText(si.editedStorageLoc ?: si.storageLocation); textSize = 13f }
                        val qtyLabel = TextView(context).apply { text = "Issue Qty (max ${si.remainingQty.toInt()})"; textSize = 11f; setTextColor(0xFF64748B.toInt()) }
                        qtyInput = EditText(context).apply { setText(si.remainingQty.toInt().toString()); textSize = 13f; inputType = android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL }
                        card.addView(plantLabel); card.addView(plantInput)
                        card.addView(slocLabel); card.addView(slocInput)
                        card.addView(qtyLabel); card.addView(qtyInput)
                    }
                    dlgLayout.addView(card)
                    Triple(plantInput, slocInput, qtyInput)
                }

                val postBtn = MaterialButton(context).apply { text = "Post GI (Mvt 351)" }
                dlgLayout.addView(postBtn)

                val scroll = android.widget.ScrollView(context).apply { addView(dlgLayout) }
                val alertDlg = android.app.AlertDialog.Builder(context).setView(scroll).setNegativeButton("Cancel", null).create()

                postBtn.setOnClickListener {
                    val today = try { LocalDate.now().toString() } catch (e: Exception) { "2025-01-01" }
                    val apiItems = stoItems.mapIndexedNotNull { i, si ->
                        if (si.giPosted) return@mapIndexedNotNull null
                        val plant = itemViews[i].first?.text?.toString()?.trim() ?: si.plant
                        val sloc = itemViews[i].second?.text?.toString()?.trim() ?: si.storageLocation ?: ""
                        val qty = itemViews[i].third?.text?.toString()?.toDoubleOrNull() ?: 0.0
                        if (qty <= 0 || sloc.isBlank()) return@mapIndexedNotNull null
                        GoodsMovementItem(
                            material = si.material, plant = plant,
                            storageLocation = sloc, quantityInEntryUnit = qty.toString(),
                            entryUnit = si.unit, goodsMovementType = "351",
                            purchaseOrder = sto.purchaseOrder, purchaseOrderItem = si.purchaseOrderItem
                        )
                    }
                    if (apiItems.isEmpty()) { Toast.makeText(context, "No valid items to post.", Toast.LENGTH_LONG).show(); return@setOnClickListener }

                    alertDlg.dismiss()
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
                                    textSuccess.text = "✓ GI Posted (Mvt 351)${if (matDoc.isNotBlank()) " — Mat. Doc: $matDoc" else ""}. Receiving plant must post GR (101) to complete transfer."
                                    textSuccess.visibility = View.VISIBLE
                                }
                                else -> { textError.text = result.message ?: "GI failed."; textError.visibility = View.VISIBLE }
                            }
                        }
                    }
                }
                alertDlg.show()
            }
        }
    }
}

private class StoListAdapter(
    private val items: List<PurchaseOrder>,
    private val onExpand: (PurchaseOrder) -> Unit,
    private val onViewItems: (PurchaseOrder) -> Unit,
    private val expandedId: String?
) : androidx.recyclerview.widget.RecyclerView.Adapter<StoListAdapter.VH>() {

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
        val sto = items[position]
        val isExpanded = expandedId == sto.purchaseOrder
        val status = when (sto.purchaseOrderStatus) {
            "C" -> Pair("Complete", 0xFF10B981.toInt())
            "B" -> Pair("Partial", 0xFFF59E0B.toInt())
            else -> Pair("Open", 0xFF3B82F6.toInt())
        }
        holder.root.removeAllViews()

        val card = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL; background = ctx.getDrawable(R.drawable.bg_card)
            setOnClickListener { onExpand(sto) }
        }
        val strip = View(ctx).apply {
            layoutParams = LinearLayout.LayoutParams(8, LinearLayout.LayoutParams.MATCH_PARENT)
            setBackgroundColor(0xFF14B8A6.toInt())
        }
        val content = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL; setPadding(16, 12, 16, 12)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val hdr = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = android.view.Gravity.CENTER_VERTICAL }
        val titleTv = TextView(ctx).apply {
            text = "STO #${sto.purchaseOrder?.trimStart('0') ?: "?"}"; textSize = 15f; setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(0xFF1E3A5F.toInt())
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val badge = TextView(ctx).apply { text = status.first; textSize = 10f; setTypeface(null, android.graphics.Typeface.BOLD); setTextColor(status.second) }
        hdr.addView(titleTv); hdr.addView(badge)
        val supplyTv = TextView(ctx).apply { text = "Supplier: ${sto.supplier ?: "N/A"}"; textSize = 13f; setTextColor(0xFF374151.toInt()) }
        val typeTv = TextView(ctx).apply { text = "Type: ${sto.purchaseOrderType ?: "N/A"}" + if (!sto.purchaseOrderDate.isNullOrBlank()) "  •  Order Date: ${sto.purchaseOrderDate}" else ""; textSize = 12f; setTextColor(0xFF64748B.toInt()) }
        content.addView(hdr); content.addView(supplyTv); content.addView(typeTv)

        if (isExpanded) {
            val extra = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL; setPadding(0, 12, 0, 0) }
            val detail = TextView(ctx).apply { text = "Company: ${sto.companyCode ?: "N/A"}  •  Currency: ${sto.documentCurrency ?: "N/A"}"; textSize = 12f; setTextColor(0xFF374151.toInt()) }
            val viewBtn = MaterialButton(ctx).apply {
                text = "View Items & Post GI"; setOnClickListener { onViewItems(sto) }
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).also { it.topMargin = 12 }
            }
            extra.addView(detail); extra.addView(viewBtn)
            content.addView(extra)
        }

        card.addView(strip); card.addView(content)
        holder.root.addView(card)
    }
}
